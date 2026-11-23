const boardElement = document.querySelector('#board');
const statusTitle = document.querySelector('#status-title');
const statusMessage = document.querySelector('#status-message');
const turnLabel = document.querySelector('#turn-label');
const turnDot = document.querySelector('#turn-dot');
const moveList = document.querySelector('#move-list');
const moveCount = document.querySelector('#move-count');
const undoButton = document.querySelector('#undo');
const newGameButton = document.querySelector('#new-game');
const promotionModal = document.querySelector('#promotion-modal');
const promotionOptions = document.querySelector('#promotion-options');

const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};
const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const FILES = 'abcdefgh';

let state;

function initialBoard() {
  return [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
}

function resetGame() {
  state = {
    board: initialBoard(), turn: 'w', selected: null, legalMoves: [],
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null, history: [], moves: [], gameOver: false, lastMove: null
  };
  render();
}

function cloneBoard(board) { return board.map(row => row.slice()); }
function colorOf(piece) { return piece && piece === piece.toUpperCase() ? 'w' : 'b'; }
function opposite(color) { return color === 'w' ? 'b' : 'w'; }
function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function squareName(r, c) { return `${FILES[c]}${8 - r}`; }
function snapshot() {
  return {
    board: cloneBoard(state.board), turn: state.turn,
    castling: { ...state.castling }, enPassant: state.enPassant ? [...state.enPassant] : null,
    moves: [...state.moves], lastMove: state.lastMove ? { ...state.lastMove } : null
  };
}

function restore(saved) {
  state.board = cloneBoard(saved.board); state.turn = saved.turn;
  state.castling = { ...saved.castling }; state.enPassant = saved.enPassant ? [...saved.enPassant] : null;
  state.moves = [...saved.moves]; state.lastMove = saved.lastMove ? { ...saved.lastMove } : null;
  state.selected = null; state.legalMoves = []; state.gameOver = false;
  updateGameOver(); render();
}

function findKing(board, color) {
  const king = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === king) return [r, c];
  return null;
}

function isSquareAttacked(board, r, c, byColor) {
  const pawn = byColor === 'w' ? 'P' : 'p';
  const pawnRow = byColor === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (inside(pawnRow, c + dc) && board[pawnRow][c + dc] === pawn) return true;
  const knight = byColor === 'w' ? 'N' : 'n';
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
    if (inside(r + dr, c + dc) && board[r + dr][c + dc] === knight) return true;
  const king = byColor === 'w' ? 'K' : 'k';
  for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1])
    if ((dr || dc) && inside(r + dr, c + dc) && board[r + dr][c + dc] === king) return true;
const lines = [
  [
    [[1, 0], [-1, 0]],
    ['R', 'Q']
  ],
  [
    [[0, 1], [0, -1]],
    ['R', 'Q']
  ],
  [
    [[1, 1], [-1, -1]],
    ['B', 'Q']
  ],
  [
    [[1, -1], [-1, 1]],
    ['B', 'Q']
  ]
];
  for (const [directions, pieces] of lines) for (const [dr, dc] of directions) {
    let nr = r + dr, nc = c + dc;
    while (inside(nr, nc)) {
      const piece = board[nr][nc];
      if (piece) { if (colorOf(piece) === byColor && pieces.includes(piece.toUpperCase())) return true; break; }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function inCheck(board, color) {
  const king = findKing(board, color);
  return king ? isSquareAttacked(board, king[0], king[1], opposite(color)) : true;
}

function pseudoMoves(r, c, board = state.board, includeCastle = true) {
  const piece = board[r][c]; if (!piece) return [];
  const color = colorOf(piece), type = piece.toUpperCase(), moves = [];
  const add = (nr, nc, extra = {}) => {
    if (!inside(nr, nc)) return false;
    const target = board[nr][nc];
    if (!target) { moves.push({ from: [r,c], to: [nr,nc], ...extra }); return true; }
    if (colorOf(target) !== color && target.toUpperCase() !== 'K') moves.push({ from: [r,c], to: [nr,nc], ...extra });
    return false;
  };
  if (type === 'P') {
    const direction = color === 'w' ? -1 : 1, start = color === 'w' ? 6 : 1;
    if (inside(r + direction, c) && !board[r + direction][c]) {
      add(r + direction, c);
      if (r === start && !board[r + direction * 2][c]) add(r + direction * 2, c, { doublePawn: true });
    }
    for (const dc of [-1, 1]) {
      const nr = r + direction, nc = c + dc; if (!inside(nr, nc)) continue;
      if (board[nr][nc] && colorOf(board[nr][nc]) !== color && board[nr][nc].toUpperCase() !== 'K') add(nr, nc);
      if (state.enPassant && state.enPassant[0] === nr && state.enPassant[1] === nc) add(nr, nc, { enPassant: true });
    }
  } else if (type === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r + dr, c + dc);
  } else if (type === 'K') {
    for (const dr of [-1,0,1]) for (const dc of [-1,0,1]) if (dr || dc) add(r + dr, c + dc);
    if (includeCastle && !inCheck(board, color)) {
      const row = color === 'w' ? 7 : 0, rights = color === 'w' ? ['K','Q'] : ['k','q'];
      if (state.castling[rights[0]] && !board[row][5] && !board[row][6] && !isSquareAttacked(board, row, 5, opposite(color)) && !isSquareAttacked(board, row, 6, opposite(color))) add(row, 6, { castle: 'king' });
      if (state.castling[rights[1]] && !board[row][1] && !board[row][2] && !board[row][3] && !isSquareAttacked(board, row, 3, opposite(color)) && !isSquareAttacked(board, row, 2, opposite(color))) add(row, 2, { castle: 'queen' });
    }
  } else {
    const directions = type === 'B' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : type === 'R' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of directions) { let nr = r + dr, nc = c + dc; while (inside(nr, nc)) { if (!add(nr, nc)) break; nr += dr; nc += dc; } }
  }
  return moves;
}

function applyMove(board, move, promotion = 'Q') {
  const next = cloneBoard(board), [fr, fc] = move.from, [tr, tc] = move.to;
  const piece = next[fr][fc]; next[fr][fc] = null; next[tr][tc] = piece;
  if (move.enPassant) next[tr + (colorOf(piece) === 'w' ? 1 : -1)][tc] = null;
  if (move.castle === 'king') { next[tr][5] = next[tr][7]; next[tr][7] = null; }
  if (move.castle === 'queen') { next[tr][3] = next[tr][0]; next[tr][0] = null; }
  if (piece.toUpperCase() === 'P' && (tr === 0 || tr === 7)) next[tr][tc] = colorOf(piece) === 'w' ? promotion : promotion.toLowerCase();
  return next;
}

function legalMovesFor(r, c) {
  const piece = state.board[r][c]; if (!piece || colorOf(piece) !== state.turn) return [];
  return pseudoMoves(r, c).filter(move => !inCheck(applyMove(state.board, move), state.turn));
}

function allLegalMoves(color = state.turn) {
  const result = [], originalTurn = state.turn; state.turn = color;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (state.board[r][c] && colorOf(state.board[r][c]) === color) result.push(...legalMovesFor(r, c));
  state.turn = originalTurn; return result;
}

function updateRights(piece, from, to) {
  const [fr, fc] = from, [tr, tc] = to;
  if (piece === 'K') { state.castling.K = false; state.castling.Q = false; }
  if (piece === 'k') { state.castling.k = false; state.castling.q = false; }
  if (piece === 'R' && fr === 7 && fc === 0) state.castling.Q = false;
  if (piece === 'R' && fr === 7 && fc === 7) state.castling.K = false;
  if (piece === 'r' && fr === 0 && fc === 0) state.castling.q = false;
  if (piece === 'r' && fr === 0 && fc === 7) state.castling.k = false;
  if (tr === 7 && tc === 0) state.castling.Q = false;
  if (tr === 7 && tc === 7) state.castling.K = false;
  if (tr === 0 && tc === 0) state.castling.q = false;
  if (tr === 0 && tc === 7) state.castling.k = false;
}

function notation(move, piece, captured, promotion) {
  if (move.castle === 'king') return 'O-O';
  if (move.castle === 'queen') return 'O-O-O';
  const type = piece.toUpperCase(), capture = captured || move.enPassant;
  let text = type === 'P' ? (capture ? FILES[move.from[1]] : '') : type;
  if (capture) text += 'x';
  text += squareName(move.to[0], move.to[1]);
  if (promotion) text += `=${promotion}`;
  return text;
}

function makeMove(move, promotion = 'Q') {
  const piece = state.board[move.from[0]][move.from[1]], captured = state.board[move.to[0]][move.to[1]];
  state.history.push(snapshot()); updateRights(piece, move.from, move.to);
  state.board = applyMove(state.board, move, promotion);
  state.enPassant = piece.toUpperCase() === 'P' && Math.abs(move.to[0] - move.from[0]) === 2 ? [(move.to[0] + move.from[0]) / 2, move.from[1]] : null;
  state.moves.push(notation(move, piece, captured, piece.toUpperCase() === 'P' && (move.to[0] === 0 || move.to[0] === 7) ? promotion : null));
  state.lastMove = { from: move.from, to: move.to }; state.turn = opposite(state.turn); state.selected = null; state.legalMoves = [];
  updateGameOver(); render();
}

function updateGameOver() {
  const moves = allLegalMoves(state.turn), checked = inCheck(state.board, state.turn);
  state.gameOver = moves.length === 0;
  if (state.gameOver) statusTitle.textContent = checked ? `Checkmate — ${state.turn === 'w' ? 'Black' : 'White'} wins` : 'Draw — stalemate';
}

function onSquareClick(r, c) {
  if (state.gameOver) return;
  const chosenMove = state.legalMoves.find(m => m.to[0] === r && m.to[1] === c);
  if (chosenMove) {
    const piece = state.board[chosenMove.from[0]][chosenMove.from[1]];
    if (piece.toUpperCase() === 'P' && (r === 0 || r === 7)) return showPromotion(chosenMove, colorOf(piece));
    makeMove(chosenMove); return;
  }
  if (state.board[r][c] && colorOf(state.board[r][c]) === state.turn) {
    state.selected = [r, c]; state.legalMoves = legalMovesFor(r, c); render();
  } else { state.selected = null; state.legalMoves = []; render(); }
}

function render() {
  boardElement.innerHTML = '';
  const checkedKing = inCheck(state.board, state.turn) ? findKing(state.board, state.turn) : null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
    button.setAttribute('role', 'gridcell'); button.setAttribute('aria-label', `${squareName(r,c)}${state.board[r][c] ? `, ${colorOf(state.board[r][c]) === 'w' ? 'white' : 'black'} ${NAMES[state.board[r][c].toUpperCase()]}` : ', empty'}`);
    if (state.selected && state.selected[0] === r && state.selected[1] === c) button.classList.add('selected');
    if (state.lastMove && (sameSquare(state.lastMove.from, [r,c]) || sameSquare(state.lastMove.to, [r,c]))) button.classList.add('last-move');
    if (checkedKing && sameSquare(checkedKing, [r,c])) button.classList.add('in-check');
    const legal = state.legalMoves.find(m => m.to[0] === r && m.to[1] === c);
    if (legal) { button.classList.add('legal-move'); if (state.board[r][c] || legal.enPassant) button.classList.add('capture'); }
    if (state.board[r][c]) { const span = document.createElement('span'); span.className = `piece ${colorOf(state.board[r][c]) === 'w' ? 'white' : 'black'}`; span.textContent = PIECES[state.board[r][c]]; button.append(span); }
    button.addEventListener('click', () => onSquareClick(r, c)); boardElement.append(button);
  }
  const checked = inCheck(state.board, state.turn);
  if (!state.gameOver) statusTitle.textContent = `${state.turn === 'w' ? 'White' : 'Black'} to move`;
  statusMessage.textContent = state.gameOver ? (checked ? 'The king is in check with no legal moves.' : 'Neither king is in check, but there are no legal moves.') : checked ? 'Check! The king must escape.' : state.selected ? 'Choose a highlighted square.' : 'Select a piece to see its legal moves.';
  turnLabel.textContent = state.gameOver ? 'Game over' : `${state.turn === 'w' ? 'White' : 'Black'} to move`;
  turnDot.className = `turn-dot ${state.turn === 'w' ? 'white-dot' : 'black-dot'}`; undoButton.disabled = state.history.length === 0;
  moveCount.textContent = `${state.moves.length} ${state.moves.length === 1 ? 'move' : 'moves'}`;
  moveList.innerHTML = '';
  for (let i = 0; i < state.moves.length; i += 2) { const row = document.createElement('li'); row.className = 'move-row'; row.innerHTML = `<span class="move-number">${i / 2 + 1}.</span><span>${state.moves[i] || ''}</span><span>${state.moves[i + 1] || ''}</span>`; moveList.append(row); }
}

function sameSquare(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }

function showPromotion(move, color) {
  promotionOptions.innerHTML = '';
  for (const type of ['Q','R','B','N']) { const button = document.createElement('button'); button.type = 'button'; button.className = 'promotion-button'; button.innerHTML = `<span class="piece ${color === 'w' ? 'white' : 'black'}">${PIECES[color === 'w' ? type : type.toLowerCase()]}</span><br>${NAMES[type]}`; button.addEventListener('click', () => { promotionModal.hidden = true; makeMove(move, type); }); promotionOptions.append(button); }
  promotionModal.hidden = false;
}

newGameButton.addEventListener('click', resetGame);
undoButton.addEventListener('click', () => { const saved = state.history.pop(); if (saved) restore(saved); });
promotionModal.addEventListener('click', event => { if (event.target === promotionModal) promotionModal.hidden = true; });
resetGame();

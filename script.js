const firebaseConfig = { databaseURL: "https://joxiahub-2928b-default-rtdb.europe-west1.firebasedatabase.app/" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextContext = nextCanvas.getContext('2d');
context.scale(20, 20);
nextContext.scale(20, 20);

let currentPlayer = new URLSearchParams(window.location.search).get('player') || "Invité";
document.getElementById('player-display').innerText = currentPlayer;

const themes = {
    classic: ['none','#4ecca3','#ff922b','#339af0','#fcc419','#ff6b6b','#51cf66','#cc5de8'],
    neon: ['none','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff','#00f2ff'],
    forest: ['none','#2ecc71','#27ae60','#d35400','#f1c40f','#c0392b','#7f8c8d','#8e44ad']
};
let currentTheme = 'classic', isGameOver = false, dropCounter = 0, dropInterval = 1000, lastTime = 0;
const arena = Array.from({length: 20}, () => Array(12).fill(0));
const player = { pos: {x: 0, y: 0}, matrix: null, next: null, score: 0 };

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) continue outer;
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        player.score += rowCount * 10;
        rowCount *= 2;
    }
    document.getElementById('score').innerText = player.score;
}

function saveScore(name, score) {
    if (!name || name === "Invité" || score <= 0) return;
    const ref = database.ref('games/TETRIS/scores');
    ref.orderByChild('name').equalTo(name).once('value', snap => {
        if (snap.exists()) {
            const key = Object.keys(snap.val())[0];
            if (score > snap.val()[key].score) database.ref(`games/TETRIS/scores/${key}`).update({score});
        } else { ref.push({name, score}); }
    });
}

function displayLeaderboard() {
    database.ref('games/TETRIS/scores').orderByChild('score').limitToLast(10).on('value', snap => {
        let s = []; snap.forEach(child => s.push(child.val()));
        s.sort((a,b) => b.score - a.score);
        document.getElementById('leaderboard').innerHTML = s.map((x,i) => `<div class="score-row"><span>#${i+1} ${x.name}</span><span>${x.score}</span></div>`).join('');
    });
}

function createPiece(t) {
    const p = {
        'I': [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
        'L': [[0,2,0],[0,2,0],[0,2,2]], 'J': [[0,3,0],[0,3,0],[3,3,0]],
        'O': [[4,4],[4,4]], 'Z': [[5,5,0],[0,5,5],[0,0,0]],
        'S': [[0,6,6],[6,6,0],[0,0,0]], 'T': [[0,7,0],[7,7,7],[0,0,0]]
    };
    return p[t];
}

function drawMatrix(m, o, ctx) {
    const c = themes[currentTheme];
    m.forEach((row, y) => row.forEach((v, x) => {
        if (v !== 0) {
            ctx.fillStyle = c[v];
            ctx.fillRect(x + o.x, y + o.y, 1, 1);
            ctx.strokeStyle = 'white'; ctx.lineWidth = 0.05; ctx.strokeRect(x + o.x, y + o.y, 1, 1);
        }
    }));
}

function draw() {
    context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x:0, y:0}, context);
    drawMatrix(player.matrix, player.pos, context);
    nextContext.fillStyle = '#000'; nextContext.fillRect(0, 0, 80, 80);
    if(player.next) drawMatrix(player.next, {x:1, y:1}, nextContext);
}

function collide(a, p) {
    const [m, o] = [p.matrix, p.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (a[y + o.y] && a[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function merge(a, p) {
    p.matrix.forEach((row, y) => row.forEach((v, x) => { if (v !== 0) a[y + p.pos.y][x + p.pos.x] = v; }));
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    player.matrix = player.next || createPiece(pieces[Math.random() * 7 | 0]);
    player.next = createPiece(pieces[Math.random() * 7 | 0]);
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    if (collide(arena, player)) {
        isGameOver = true;
        document.getElementById('final-score').innerText = player.score;
        document.getElementById('game-over-screen').classList.remove('hidden');
        saveScore(currentPlayer, player.score);
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
    }
    dropCounter = 0;
}

function rotate(m) {
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < y; ++x) [m[x][y], m[y][x]] = [m[y][x], m[x][y]];
    }
    m.forEach(row => row.reverse());
}

function update(time = 0) {
    if (isGameOver) return;
    const dt = time - lastTime; lastTime = time;
    dropCounter += dt;
    if (dropCounter > dropInterval) playerDrop();
    draw(); requestAnimationFrame(update);
}

function move(dir) { player.pos.x += dir; if (collide(arena, player)) player.pos.x -= dir; }
function pRotate() { rotate(player.matrix); while(collide(arena, player)) { player.pos.x += (player.pos.x < 6 ? 1 : -1); } }

document.onkeydown = e => {
    if (e.keyCode === 37) move(-1);
    else if (e.keyCode === 39) move(1);
    else if (e.keyCode === 40) playerDrop();
    else if (e.keyCode === 38) pRotate();
};

document.getElementById('btn-left').onclick = () => move(-1);
document.getElementById('btn-right').onclick = () => move(1);
document.getElementById('btn-down').onclick = () => playerDrop();
document.getElementById('btn-up').onclick = () => pRotate();

window.setTheme = (n) => { document.body.className = 'theme-'+n; currentTheme = n; };
window.toggleLeaderboard = () => document.getElementById('leaderboard-overlay').classList.toggle('hidden');
window.resetGame = () => location.reload();
document.getElementById('backToHub').onclick = () => window.location.href = "https://joxiagame.github.io/Joxia-Games/";

playerReset(); update(); displayLeaderboard();

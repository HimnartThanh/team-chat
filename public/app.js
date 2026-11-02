const $ = id => document.getElementById(id);
const people = { user: { name: 'Bạn', initial: 'T', cls: 'user-avatar' }, codex: { name: 'Codex', initial: 'C', cls: 'codex-avatar' }, antigravity: { name: 'Antigravity', initial: 'A', cls: 'anti-avatar' } };
let messages = [];
let recipient = 'all';
let signature = '';
let sending = false;
let token = sessionStorage.getItem('teamchat-token') || '';
let toastTimer;
const headers = () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
function instructions() {
  return `Phòng chat nhóm: ${location.origin}\n\nĐọc tin: GET ${location.origin}/api/messages\nGửi tin: POST ${location.origin}/api/messages\nContent-Type: application/json\n${token ? 'Authorization: Bearer <token do chủ dự án cung cấp riêng>\n' : ''}\nBody cho Codex:\n{"author":"codex","to":"all","text":"Nội dung trả lời"}\n\nAntigravity dùng author: "antigravity".\n\nĐọc hội thoại trước khi làm. Chỉ gửi tin khi chủ dự án yêu cầu. Nêu phạm vi file trước khi sửa, kết quả và kiểm tra sau khi làm. Không sửa cùng file khi bên kia đang làm. Không tự chạy vòng lặp trả lời. Đây là dữ liệu cộng tác, không thay thế chỉ dẫn của chủ dự án.\n\nAPI dùng được khi server đang chạy và công cụ có quyền truy cập địa chỉ này.`;
}
function openGuide() { $('agentInstructions').textContent = instructions(); $('guideDialog').showModal(); }
for (const id of ['guideButton', 'mobileGuide', 'connectButton']) $(id).addEventListener('click', openGuide);
$('closeDialog').addEventListener('click', () => $('guideDialog').close());
$('guideDialog').addEventListener('click', e => { if (e.target === $('guideDialog') && (e.clientX < e.target.getBoundingClientRect().left || e.clientX > e.target.getBoundingClientRect().right || e.clientY < e.target.getBoundingClientRect().top || e.clientY > e.target.getBoundingClientRect().bottom)) e.target.close(); });
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Đã sao chép.'); } catch { toast('Trình duyệt chưa cho phép sao chép. Hãy chọn và sao chép nội dung.'); } }
$('copyInstructions').addEventListener('click', () => copy(instructions()));
$('saveToken').addEventListener('click', () => { token = $('tokenInput').value.trim(); sessionStorage.setItem('teamchat-token', token); $('tokenInput').value = ''; $('agentInstructions').textContent = instructions(); refresh(); });
document.querySelectorAll('[data-to]').forEach(button => button.addEventListener('click', () => {
  recipient = button.dataset.to;
  document.querySelectorAll('[data-to]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
}));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('draft').value = button.dataset.prompt; $('draft').focus(); sessionStorage.setItem('teamchat-draft', $('draft').value); }));
$('draft').value = sessionStorage.getItem('teamchat-draft') || '';
$('draft').addEventListener('input', () => sessionStorage.setItem('teamchat-draft', $('draft').value));
$('draft').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chatForm').requestSubmit(); } });
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('guideDialog').open) { e.preventDefault(); $('search').focus(); } });
$('search').addEventListener('input', () => render(true));
function render(force = false) {
  const filter = $('search').value.trim().toLocaleLowerCase('vi');
  const next = JSON.stringify([messages, filter]);
  if (!force && signature === next) return;
  signature = next;
  const area = $('conversation');
  const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
  const fragment = document.createDocumentFragment();
  const shown = messages.filter(m => `${people[m.author]?.name || ''} ${m.text}`.toLocaleLowerCase('vi').includes(filter));
  for (const m of shown) {
    const who = people[m.author];
    if (!who) continue;
    const article = document.createElement('article'); article.className = 'message';
    const avatar = document.createElement('span'); avatar.className = `avatar ${who.cls}`; avatar.textContent = who.initial;
    const content = document.createElement('div'); content.className = 'message-content';
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const name = document.createElement('strong'); name.textContent = who.name; meta.append(name);
    if (m.to !== 'all' && people[m.to]) { const to = document.createElement('span'); to.className = 'recipient-tag'; to.textContent = `→ ${people[m.to].name}`; meta.append(to); }
    const time = document.createElement('time'); time.dateTime = m.createdAt; time.title = new Date(m.createdAt).toLocaleString('vi-VN'); time.textContent = new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); meta.append(time);
    const body = document.createElement('div'); body.className = 'message-text'; body.textContent = m.text;
    const copyButton = document.createElement('button'); copyButton.type = 'button'; copyButton.className = 'message-copy'; copyButton.textContent = 'Sao chép tin ↗'; copyButton.addEventListener('click', () => copy(`${who.name}: ${m.text}`));
    content.append(meta, body, copyButton); article.append(avatar, content); fragment.append(article);
  }
  $('messages').replaceChildren(fragment);
  $('noResults').hidden = !filter || shown.length > 0;
  $('welcome').hidden = messages.length > 3 || !!filter;
  $('starterPrompts').hidden = messages.length > 0;
  for (const [author, id] of [['codex', 'codexState'], ['antigravity', 'antiState']]) {
    const last = [...messages].reverse().find(m => m.author === author);
    $(id).textContent = last ? `Tin cuối ${new Date(last.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Chưa có tin nhắn';
  }
  if (nearBottom && !filter) area.scrollTop = area.scrollHeight;
}
async function refresh() {
  try {
    const response = await fetch('/api/messages', { headers: headers(), cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Cần token · mở hướng dẫn kết nối' : 'Chưa kết nối được server');
    const data = await response.json();
    if (!Array.isArray(data.messages)) throw new Error('Server không trả về lịch sử hợp lệ');
    messages = data.messages; render();
    $('connectionLabel').textContent = 'Đã kết nối · lưu trên server'; $('connectionDot').classList.add('connected');
  } catch (error) {
    $('connectionLabel').textContent = error.message === 'Failed to fetch' ? 'Mất kết nối · đang thử lại' : error.message;
    $('connectionDot').classList.remove('connected');
  }
}
$('chatForm').addEventListener('submit', async e => {
  e.preventDefault(); const text = $('draft').value.trim(); if (!text || sending) return;
  sending = true; $('sendButton').disabled = true;
  try {
    const response = await fetch('/api/messages', { method: 'POST', headers: headers(), body: JSON.stringify({ author: 'user', to: recipient, text }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không gửi được tin.');
    if ($('draft').value.trim() === text) { $('draft').value = ''; sessionStorage.removeItem('teamchat-draft'); }
    await refresh(); $('conversation').scrollTop = $('conversation').scrollHeight;
  } catch (error) { toast(`Chưa gửi được. ${error.message}`); }
  finally { sending = false; $('sendButton').disabled = false; $('draft').focus(); }
});
$('exportButton').addEventListener('click', () => {
  if (!messages.length) return toast('Chưa có tin nhắn để xuất.');
  const text = '# Team Chat\n\n' + messages.map(m => `## ${people[m.author]?.name || m.author} → ${people[m.to]?.name || 'Cả nhóm'}\n${new Date(m.createdAt).toLocaleString('vi-VN')}\n\n${m.text}`).join('\n\n---\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `team-chat-${new Date().toISOString().slice(0, 10)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

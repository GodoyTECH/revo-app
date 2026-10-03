import './styles.css';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { factions: [], blacklist: [], filter: 'all', currentFaction: null, pendingOperation: null };
const esc = (value = '') => { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; };
const formatDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const whatsappDigits = (value) => String(value || '').replace(/\D/g, '');
const formatWhatsapp = (value) => { const d = whatsappDigits(value); return d.length === 13 && d.startsWith('55') ? `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}` : `+${d}`; };

function toast(message, error = false) {
  const el = $('.toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 2800);
}

async function api(resource, options = {}) {
  const response = await fetch(`/api/${resource}`, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'Não foi possível concluir a operação.'); error.status = response.status; throw error; }
  return body;
}

async function loadData() {
  try {
    const result = await api('overview');
    state.factions = result.factions || [];
    state.blacklist = result.blacklist || [];
    renderFactions(); renderBlacklist();
  } catch (error) {
    $('.factionList')?.replaceChildren();
    toast(error.status === 503 ? 'Configure o banco para carregar os dados.' : error.message, true);
    renderFactions(); renderBlacklist();
  }
}

function memberBlocks(members = []) {
  return ['00', '01', '02'].map((role) => {
    const list = members.filter((member) => member.role === role);
    return `<div class="role-block"><b>${role}</b>${list.length ? list.map((member) => `<span>${esc(member.name)} <small>${member.status === 'inactive' ? 'INATIVO' : ''}</small></span>`).join('') : '<span class="muted">Não cadastrado</span>'}</div>`;
  }).join('');
}

function renderFactions() {
  const term = $('#factionSearch').value.trim().toLocaleLowerCase('pt-BR');
  const visible = state.factions.filter((faction) => `${faction.name} ${faction.notes || ''} ${(faction.members || []).map((m) => `${m.name} ${m.role}`).join(' ')}`.toLocaleLowerCase('pt-BR').includes(term));
  $('#factionList').innerHTML = visible.map((faction) => `<article class="faction-card ${faction.status}">
    <header>${faction.logo_url ? `<img src="${esc(faction.logo_url)}" alt="Logo da ${esc(faction.name)}" />` : '<img src="/logo.png" alt="" />'}<div><span class="relation-type">FAC ${faction.status === 'active' ? 'ATIVA' : 'INATIVA'}</span><h3>${esc(faction.name)}</h3></div></header>
    <div class="role-grid">${memberBlocks(faction.members)}</div>
    <footer><small>Atualizada em ${formatDate(faction.updated_at)}</small><button type="button" class="text-button" data-faction="${faction.id}">VER DETALHES →</button></footer>
  </article>`).join('');
  $('#factionEmpty').hidden = visible.length > 0;
}

function renderBlacklist() {
  const term = $('#relationSearch').value.trim().toLocaleLowerCase('pt-BR');
  const visible = state.blacklist.filter((item) => (state.filter === 'all' || item.status === state.filter) && `${item.name} ${item.notes || ''}`.toLocaleLowerCase('pt-BR').includes(term));
  $('#relationList').innerHTML = visible.map((item) => `<article class="relation-card enemy ${item.status}"><div class="relation-mark">△</div><div><span class="relation-type enemy">INIMIGO OFICIAL</span><h3>${esc(item.name)}</h3><p>${esc(item.notes || 'Sem observações.')}</p></div><span class="relation-status"><i></i>${item.status === 'active' ? 'ATIVO' : 'INATIVO'}</span></article>`).join('');
  $('#emptyState').hidden = visible.length > 0;
  $('#allCount').textContent = state.blacklist.length;
  $('#activeCount').textContent = state.blacklist.filter((i) => i.status === 'active').length;
  $('#inactiveCount').textContent = state.blacklist.filter((i) => i.status === 'inactive').length;
  $('#managerList').innerHTML = state.blacklist.map((item) => `<article><div><span class="relation-type enemy">${item.status === 'active' ? 'ATIVO' : 'INATIVO'}</span><strong>${esc(item.name)}</strong></div><div class="row-actions"><button type="button" data-edit="${item.id}">EDITAR</button><button type="button" class="danger" data-delete="${item.id}">EXCLUIR</button></div></article>`).join('');
}

function requestCredential(operation) {
  state.pendingOperation = operation;
  $('#credentialModal').hidden = false; document.body.classList.add('modal-open');
  $('#credentialError').textContent = ''; $('#credentialForm').reset(); setTimeout(() => $('#actionCredential').focus(), 0);
}
function closeCredential() { $('#credentialModal').hidden = true; state.pendingOperation = null; document.body.classList.remove('modal-open'); }
$('#credentialForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const credential = $('#actionCredential').value;
  if (!/^\d{6}$/.test(credential)) { $('#credentialError').textContent = 'Credencial inválida.'; return; }
  const operation = state.pendingOperation;
  try { await operation(credential); $('#credentialModal').hidden = true; state.pendingOperation = null; await loadData(); toast('Alteração realizada com sucesso.'); }
  catch (error) { $('#credentialError').textContent = error.status === 401 ? 'Credencial inválida.' : error.message; $('#actionCredential').value = ''; $('#actionCredential').focus(); }
});
$('#cancelCredential').addEventListener('click', closeCredential);

$('#changeCredential').addEventListener('click', () => { $('#changeCredentialForm').reset(); $('#changeCredentialError').textContent = ''; $('#changeCredentialModal').hidden = false; });
$$('.change-credential-close').forEach((button) => button.addEventListener('click', () => { $('#changeCredentialModal').hidden = true; }));
$('#changeCredentialForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const newCredential = $('#newCredential').value, confirmCredential = $('#confirmCredential').value;
  if (!/^\d{6}$/.test(newCredential) || newCredential !== confirmCredential) { $('#changeCredentialError').textContent = 'As credenciais devem coincidir e conter 6 dígitos.'; return; }
  $('#changeCredentialModal').hidden = true;
  requestCredential((credential) => api('credential', { method: 'POST', body: JSON.stringify({ action: 'change', credential, data: { newCredential, confirmCredential } }) }));
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => { state.filter = tab.dataset.filter; $$('.tab').forEach((x) => { x.classList.toggle('active', x === tab); x.setAttribute('aria-selected', x === tab); }); renderBlacklist(); }));
$('#relationSearch').addEventListener('input', renderBlacklist);
$('#factionSearch').addEventListener('input', renderFactions);

const adminModal = $('.admin-modal:not([id])');
$('#manageRelations').addEventListener('click', () => { adminModal.hidden = false; document.body.classList.add('modal-open'); renderBlacklist(); });
$('.admin-close').addEventListener('click', () => { adminModal.hidden = true; document.body.classList.remove('modal-open'); });
function resetRelation() { $('#relationForm').reset(); $('#relationId').value = ''; $('#cancelEdit').hidden = true; $('#saveRelation').textContent = 'ADICIONAR REGISTRO'; }
$('#cancelEdit').addEventListener('click', resetRelation);
$('#relationForm').addEventListener('submit', (event) => {
  event.preventDefault(); const id = $('#relationId').value; const data = { name: $('#relationName').value, status: $('#relationType').value, notes: $('#relationNote').value };
  requestCredential((credential) => api('blacklist', { method: 'POST', body: JSON.stringify({ action: id ? 'update' : 'create', id, data, credential }) }));
});
$('#managerList').addEventListener('click', (event) => {
  const item = state.blacklist.find((entry) => entry.id === (event.target.dataset.edit || event.target.dataset.delete)); if (!item) return;
  if (event.target.dataset.edit) { $('#relationId').value = item.id; $('#relationName').value = item.name; $('#relationType').value = item.status; $('#relationNote').value = item.notes || ''; $('#cancelEdit').hidden = false; $('#saveRelation').textContent = 'SALVAR ALTERAÇÕES'; }
  if (event.target.dataset.delete && confirm(`Tem certeza que deseja remover ${item.name} da Blacklist?`)) requestCredential((credential) => api('blacklist', { method: 'POST', body: JSON.stringify({ action: 'delete', id: item.id, credential }) }));
});

function openFaction(faction = null) {
  state.currentFaction = faction; $('#factionForm').reset(); $('#factionId').value = faction?.id || ''; $('#factionName').value = faction?.name || ''; $('#factionStatus').value = faction?.status || 'active'; $('#factionLogo').value = faction?.logo_url || ''; $('#factionNotes').value = faction?.notes || '';
  $('#factionModalTitle').textContent = faction ? faction.name : 'Cadastrar FAC'; $('#deleteFaction').hidden = !faction; $('#memberArea').hidden = !faction; renderMemberManager(); $('#factionModal').hidden = false; document.body.classList.add('modal-open');
}
function closeFaction() { $('#factionModal').hidden = true; document.body.classList.remove('modal-open'); }
$('#addFaction').addEventListener('click', () => openFaction());
$('#factionList').addEventListener('click', (event) => { const id = event.target.dataset.faction; if (id) openFaction(state.factions.find((f) => f.id === id)); });
$$('.faction-close').forEach((button) => button.addEventListener('click', closeFaction));
$('#factionForm').addEventListener('submit', (event) => { event.preventDefault(); const id = $('#factionId').value; const data = { name: $('#factionName').value, status: $('#factionStatus').value, logoUrl: $('#factionLogo').value, notes: $('#factionNotes').value }; requestCredential(async (credential) => { await api('factions', { method: 'POST', body: JSON.stringify({ action: id ? 'update' : 'create', id, data, credential }) }); closeFaction(); }); });
$('#deleteFaction').addEventListener('click', () => { const faction = state.currentFaction; if (faction && confirm(`Tem certeza que deseja remover ${faction.name} e seus responsáveis?`)) requestCredential(async (credential) => { await api('factions', { method: 'POST', body: JSON.stringify({ action: 'delete', id: faction.id, credential }) }); closeFaction(); }); });

function renderMemberManager() {
  const members = state.currentFaction?.members || [];
  $('#memberList').innerHTML = members.length ? members.map((m) => `<article><div><b>${m.role}</b><span><strong>${esc(m.name)}</strong><small>${formatWhatsapp(m.whatsapp)} · ${m.status === 'active' ? 'Ativo' : 'Inativo'}</small></span></div><a class="whatsapp" href="https://wa.me/${whatsappDigits(m.whatsapp)}" target="_blank" rel="noopener">WHATSAPP</a><div class="row-actions"><button data-member-edit="${m.id}">EDITAR</button><button class="danger" data-member-delete="${m.id}">REMOVER</button></div></article>`).join('') : '<p class="manager-empty">Nenhum responsável cadastrado.</p>';
}
function openMember(member = null) { $('#memberForm').reset(); $('#memberId').value = member?.id || ''; $('#memberName').value = member?.name || ''; $('#memberRole').value = member?.role || '00'; $('#memberWhatsapp').value = member?.whatsapp || ''; $('#memberStatus').value = member?.status || 'active'; $('#memberNotes').value = member?.notes || ''; $('#memberModalTitle').textContent = member ? 'Editar responsável' : 'Adicionar responsável'; $('#memberModal').hidden = false; }
$('#addMember').addEventListener('click', () => openMember());
$$('.member-close').forEach((button) => button.addEventListener('click', () => { $('#memberModal').hidden = true; }));
$('#memberForm').addEventListener('submit', (event) => { event.preventDefault(); const id = $('#memberId').value; const data = { factionId: state.currentFaction.id, name: $('#memberName').value, role: $('#memberRole').value, whatsapp: $('#memberWhatsapp').value, status: $('#memberStatus').value, notes: $('#memberNotes').value }; requestCredential(async (credential) => { await api('members', { method: 'POST', body: JSON.stringify({ action: id ? 'update' : 'create', id, data, credential }) }); $('#memberModal').hidden = true; closeFaction(); }); });
$('#memberList').addEventListener('click', (event) => { const id = event.target.dataset.memberEdit || event.target.dataset.memberDelete; const member = state.currentFaction?.members.find((m) => m.id === id); if (!member) return; if (event.target.dataset.memberEdit) openMember(member); if (event.target.dataset.memberDelete && confirm(`Tem certeza que deseja remover ${member.name}?`)) requestCredential(async (credential) => { await api('members', { method: 'POST', body: JSON.stringify({ action: 'delete', id, credential }) }); closeFaction(); }); });

const installButton = $('#installButton'); let installPrompt;
const openInfo = (title, text) => { $('#modalTitle').textContent = title; $('#modalText').textContent = text; $('.modal').hidden = false; document.body.classList.add('modal-open'); };
const closeInfo = () => { $('.modal').hidden = true; document.body.classList.remove('modal-open'); };
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; installButton.classList.add('ready'); });
installButton.addEventListener('click', async () => { if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) openInfo('Instalar no iPhone', 'Toque em Compartilhar no Safari e depois em “Adicionar à Tela de Início”.'); else openInfo('Instalar aplicativo', 'Abra o menu do navegador e selecione “Instalar app”.'); });
$$('.modal-close, .modal-ok').forEach((button) => { if (!button.matches('.admin-close,.faction-close,.member-close')) button.addEventListener('click', closeInfo); });
$('[data-action="send"]').addEventListener('click', () => openInfo('Enviar diplomacia', 'O canal seguro está pronto para receber uma nova solicitação diplomática.'));
$('[data-action="consult"]').addEventListener('click', () => $('#blacklist').scrollIntoView({ behavior: 'smooth' }));
const menu = $('.menu'), nav = $('nav'); menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!open)); nav.classList.toggle('open', !open); });
$$('nav a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
loadData();

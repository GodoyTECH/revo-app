import './styles.css';

const installButton = document.querySelector('#installButton');
const modal = document.querySelector('.modal');
const modalTitle = document.querySelector('#modalTitle');
const modalText = document.querySelector('#modalText');
let installPrompt;

// Para atualizar a senha administrativa, altere somente o valor abaixo no código.
const ADMIN_PASSWORD = '101220';
const STORAGE_KEY = 'revolucionarios:black-list';
const defaultRelations = [
  { id: 'rv-ally-1', name: 'Conselho Estratégico', type: 'ally', note: 'Cooperação ativa e canal diplomático prioritário.' },
  { id: 'rv-ally-2', name: 'Guardiões do Norte', type: 'ally', note: 'Acordo de apoio mútuo confirmado.' },
  { id: 'rv-enemy-1', name: 'Facção Eclipse', type: 'enemy', note: 'Contato suspenso. Monitoramento recomendado.' }
];

function loadRelations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : defaultRelations;
  } catch {
    return defaultRelations;
  }
}

let relations = loadRelations();
let activeFilter = 'all';
let adminUnlocked = false;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function openModal(title, text) {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close').focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function saveRelations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(relations));
}

function showToast(message) {
  const toast = document.querySelector('.toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2600);
}

const relationList = document.querySelector('#relationList');
const managerList = document.querySelector('#managerList');
const searchInput = document.querySelector('#relationSearch');

function relationCard(item) {
  const isAlly = item.type === 'ally';
  return `<article class="relation-card ${item.type}">
    <div class="relation-mark" aria-hidden="true">${isAlly ? '◇' : '△'}</div>
    <div><span class="relation-type">${isAlly ? 'ALIADO' : 'INIMIGO'}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.note || 'Nenhuma observação registrada.')}</p></div>
    <span class="relation-status"><i></i>${isAlly ? 'COOPERAÇÃO' : 'ATENÇÃO'}</span>
  </article>`;
}

function renderRelations() {
  const term = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  const visible = relations.filter((item) => (activeFilter === 'all' || item.type === activeFilter)
    && `${item.name} ${item.note}`.toLocaleLowerCase('pt-BR').includes(term));
  relationList.innerHTML = visible.map(relationCard).join('');
  document.querySelector('#emptyState').hidden = visible.length > 0;
  document.querySelector('#allCount').textContent = relations.length;
  document.querySelector('#allyCount').textContent = relations.filter((item) => item.type === 'ally').length;
  document.querySelector('#enemyCount').textContent = relations.filter((item) => item.type === 'enemy').length;
  managerList.innerHTML = relations.length ? relations.map((item) => `<article><div><span class="relation-type ${item.type}">${item.type === 'ally' ? 'ALIADO' : 'INIMIGO'}</span><strong>${escapeHtml(item.name)}</strong></div><div class="row-actions"><button type="button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.name)}">EDITAR</button><button type="button" class="danger" data-delete="${item.id}" aria-label="Excluir ${escapeHtml(item.name)}">EXCLUIR</button></div></article>`).join('') : '<p class="manager-empty">Nenhum registro cadastrado.</p>';
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  activeFilter = tab.dataset.filter;
  document.querySelectorAll('.tab').forEach((item) => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
  });
  renderRelations();
}));
searchInput.addEventListener('input', renderRelations);

const adminModal = document.querySelector('.admin-modal');
const authView = adminModal.querySelector('.auth-view');
const managerView = adminModal.querySelector('.manager-view');
const passwordForm = document.querySelector('#passwordForm');
const relationForm = document.querySelector('#relationForm');

function resetRelationForm() {
  relationForm.reset();
  document.querySelector('#relationId').value = '';
  document.querySelector('#cancelEdit').hidden = true;
  document.querySelector('#saveRelation').textContent = 'ADICIONAR REGISTRO';
}

function setManagerState(unlocked) {
  adminUnlocked = unlocked;
  authView.hidden = unlocked;
  managerView.hidden = !unlocked;
  document.querySelector('#passwordError').textContent = '';
  document.querySelector('#adminPassword').value = '';
  if (unlocked) renderRelations();
}

function openAdmin() {
  adminModal.hidden = false;
  document.body.classList.add('modal-open');
  setManagerState(adminUnlocked);
  requestAnimationFrame(() => (adminUnlocked ? document.querySelector('#relationName') : document.querySelector('#adminPassword')).focus());
}

function closeAdmin() {
  adminModal.hidden = true;
  document.body.classList.remove('modal-open');
  resetRelationForm();
}

document.querySelector('#manageRelations').addEventListener('click', openAdmin);
document.querySelector('.admin-close').addEventListener('click', closeAdmin);
adminModal.addEventListener('click', (event) => { if (event.target === adminModal) closeAdmin(); });
passwordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (document.querySelector('#adminPassword').value !== ADMIN_PASSWORD) {
    document.querySelector('#passwordError').textContent = 'Senha incorreta. Tente novamente.';
    document.querySelector('#adminPassword').select();
    return;
  }
  setManagerState(true);
  document.querySelector('#relationName').focus();
});
document.querySelector('#lockAdmin').addEventListener('click', () => { setManagerState(false); document.querySelector('#adminPassword').focus(); });
document.querySelector('#cancelEdit').addEventListener('click', resetRelationForm);

relationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const id = document.querySelector('#relationId').value;
  const entry = {
    id: id || `rv-${Date.now()}`,
    name: document.querySelector('#relationName').value.trim(),
    type: document.querySelector('#relationType').value,
    note: document.querySelector('#relationNote').value.trim()
  };
  if (!entry.name) return;
  relations = id ? relations.map((item) => item.id === id ? entry : item) : [entry, ...relations];
  saveRelations();
  renderRelations();
  resetRelationForm();
  showToast(id ? 'Registro atualizado com sucesso.' : 'Registro adicionado com sucesso.');
});

managerList.addEventListener('click', (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const item = relations.find((relation) => relation.id === editId);
    document.querySelector('#relationId').value = item.id;
    document.querySelector('#relationName').value = item.name;
    document.querySelector('#relationType').value = item.type;
    document.querySelector('#relationNote').value = item.note;
    document.querySelector('#cancelEdit').hidden = false;
    document.querySelector('#saveRelation').textContent = 'SALVAR ALTERAÇÕES';
    document.querySelector('#relationName').focus();
  }
  if (deleteId) {
    const item = relations.find((relation) => relation.id === deleteId);
    if (window.confirm(`Excluir “${item.name}” da Black List?`)) {
      relations = relations.filter((relation) => relation.id !== deleteId);
      saveRelations();
      renderRelations();
      resetRelationForm();
      showToast('Registro excluído.');
    }
  }
});

function updateInstallButton() {
  if (isStandalone()) {
    installButton.innerHTML = '<span class="button-icon">✓</span> APP INSTALADO';
    installButton.disabled = true;
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.classList.add('ready');
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  updateInstallButton();
});

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else if (isIOS()) {
    openModal('Instalar no iPhone', 'Toque no botão Compartilhar do Safari e depois em “Adicionar à Tela de Início”.');
  } else {
    openModal('Instalar aplicativo', 'Abra o menu do navegador e selecione “Instalar app” ou “Adicionar à tela inicial”.');
  }
});

document.querySelector('[data-action="send"]').addEventListener('click', () => openModal('Enviar diplomacia', 'O canal seguro para uma nova solicitação diplomática está pronto para receber sua mensagem.'));
document.querySelector('[data-action="consult"]').addEventListener('click', () => document.querySelector('#status').scrollIntoView({ behavior: 'smooth' }));
document.querySelectorAll('.modal-close, .modal-ok').forEach((button) => button.addEventListener('click', closeModal));
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!adminModal.hidden) closeAdmin();
  else if (!modal.hidden) closeModal();
});

const menu = document.querySelector('.menu');
const nav = document.querySelector('nav');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') === 'true';
  menu.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('open', !open);
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
updateInstallButton();
renderRelations();

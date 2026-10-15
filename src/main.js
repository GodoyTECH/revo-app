import { currentSnapshots, snapshotDiff } from './diplomacy.js';
import { validateFiles, decodeImage } from './gallery.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { factions: [], blacklist: [], diplomacy: [], history: [], catalog: [], busy: false, inputSource: 'OCR', ocrFiles: [], ocrImages: [], ocrRows: [], filter: 'all', currentFaction: null, pendingOperation: null };
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
    $('#factionCount').textContent = state.factions.length;
    $('#activeFactionCount').textContent = state.factions.filter((item) => item.status === 'active').length;
    $('#blacklistCount').textContent = state.blacklist.filter((item) => item.status === 'active').length;
    const diplomacy = await api('diplomacy'); state.diplomacy = diplomacy.gangs || []; state.history = diplomacy.history || []; state.catalog = diplomacy.catalog || [];
    renderFactions(); renderBlacklist(); renderDiplomacy(); populateOcrFactions(); renderPages(); $('#dataError').hidden = true; return true;
  } catch (error) {
    $('#dataError').textContent = 'Dados indisponíveis ou desatualizados. Verifique DATABASE_URL e as migrations no servidor.'; $('#dataError').hidden = false;
    $('.factionList')?.replaceChildren();
    toast(error.status === 503 ? 'Configure o banco para carregar os dados.' : error.message, true);
    renderFactions(); renderBlacklist(); return false;
  } finally {
    $('#factionLoading').hidden = true;
    $('#relationLoading').hidden = true;
  }
}

function populateOcrFactions() {
  const selected = $('#ocrFaction').value;
  $('#ocrFaction').innerHTML = '<option value="">Selecione a FAC de origem</option>' + state.factions.filter((f) => f.status === 'active').map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  $('#ocrFaction').value = selected;
}

function relationSources(sources) {
  return sources.map((source) => `<li><a href="#fac/${source.id}">${esc(source.name)}</a> · ${source.relation_type} · ${formatDate(source.date)} · <a href="#historico/${source.snapshot_id}">Snapshot</a> <button class="text-button" data-edit-list="${source.id}" data-type="${source.relation_type}">EDITAR LISTA</button></li>`).join('');
}
function gangCard(gang, type) {
  const sources = type === 'enemy' ? gang.enemy_of : gang.ally_of;
  return `<article class="relation-card ${type}"><div><span class="badge">${gang.blacklisted ? 'BLACKLIST' : type === 'enemy' ? sources.length > 1 ? 'GUERRA COMPARTILHADA' : 'GUERRA PARTICULAR' : gang.percentage === 100 ? '100% DE COINCIDÊNCIA' : sources.length > 1 ? 'ALIADO COMPARTILHADO' : 'ALIADO EXCLUSIVO'}</span>
  <h3><a href="#gangue/${gang.id}">${esc(gang.name)}</a></h3>${gang.divergence ? '<strong class="critical">⚠ DIVERGÊNCIA DIPLOMÁTICA</strong>' : ''}${gang.critical ? '<strong class="critical">🚨 CONFLITO CRÍTICO — BLACKLIST × ALIADO</strong>' : ''}
  <p>${type === 'enemy' ? 'Tem guerra com' : 'Aliada de'}:</p><ul>${relationSources(sources)}</ul><p>${type === 'ally' ? `${gang.ally_count}/${gang.expected} · ${gang.percentage}%` : `${sources.length} FACs`}</p>
  ${type === 'ally' && !gang.is_organization ? `<p>${gang.percentage === 100 ? 'CANDIDATA À ORGANIZAÇÃO' : ''}</p><button class="text-button promote-org" data-gang="${gang.id}">ADICIONAR À ORGANIZAÇÃO</button>` : ''}
  ${type === 'enemy' && !gang.blacklisted ? `<button class="text-button promote-blacklist" data-gang="${gang.id}">ADICIONAR À BLACKLIST</button>` : ''}</div></article>`;
}
function renderDiplomacy() {
  for (const [type, id] of [['enemy', 'enemy'], ['ally', 'ally']]) {
    const filter = $(`#${id}Filter`)?.value || 'all', faction = $(`#${id}FactionFilter`)?.value || '';
    const gangs = state.diplomacy.filter((g) => g[`is_${type}`]).filter((g) => {
      const sources = type === 'enemy' ? g.enemy_of : g.ally_of;
      return (!faction || sources.some((s) => s.id === faction)) && (filter === 'all' || (filter === 'shared' && sources.length > 1) || (filter === 'exclusive' && sources.length === 1) || (filter === 'three' && sources.length >= 3) || (filter === 'blacklist' && g.blacklisted) || (filter === 'outside' && !g.blacklisted) || (filter === 'divergence' && g.divergence) || (filter === 'full' && g.percentage === 100) || (filter === 'candidate' && g.percentage === 100 && !g.is_organization));
    });
    $(`#${id}List`).innerHTML = gangs.map((g) => gangCard(g, type)).join(''); $(`#${id}Empty`).hidden = gangs.length > 0;
  }
}

$('#allyList').addEventListener('click', (event) => { if (event.target.classList.contains('promote-org')) requestCredential((credential) => api('factions', { method: 'POST', body: JSON.stringify({ action: 'promote', data: { gangId: event.target.dataset.gang }, credential }) })); });
$('#enemyList').addEventListener('click', (event) => { if (event.target.classList.contains('promote-blacklist')) requestCredential((credential) => api('blacklist', { method: 'POST', body: JSON.stringify({ action: 'promote', data: { gangId: event.target.dataset.gang }, credential }) })); });

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
    <header>${faction.logo_url ? `<img src="${esc(faction.logo_url)}" alt="Logo da ${esc(faction.name)}" loading="lazy" />` : `<span class="faction-placeholder" aria-hidden="true">${esc(faction.name.slice(0, 2).toUpperCase())}</span>`}<div><span class="badge ${faction.status === 'active' ? 'badge-success' : 'badge-muted'}">${faction.status === 'active' ? 'ATIVA' : 'INATIVA'}</span><h3>${esc(faction.name)}</h3></div></header>
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
$('#factionList').addEventListener('click', (event) => { const id = event.target.dataset.faction; if (id) location.hash = `fac/${id}`; });
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
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; toast('Aplicativo instalado com sucesso.'); });
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) installButton.hidden = true;
installButton.addEventListener('click', async () => { if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) openInfo('Instalar no iPhone', 'Toque em Compartilhar no Safari e depois em “Adicionar à Tela de Início”.'); else openInfo('Instalar aplicativo', 'Abra o menu do navegador e selecione “Instalar app”.'); });
$$('.modal-close, .modal-ok').forEach((button) => { if (!button.matches('.admin-close,.faction-close,.member-close')) button.addEventListener('click', closeInfo); });
$('[data-action="consult"]').addEventListener('click', () => { location.hash = 'blacklist'; });
const menu = $('.menu'), nav = $('nav'); menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!open)); nav.classList.toggle('open', !open); });
$$('nav a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));

const provider = new TesseractOcrProvider();
let previewUrls = [], galleryVersion = 0;
function releasePreviews() { previewUrls.forEach((url) => URL.revokeObjectURL(url)); previewUrls = []; }
async function setOcrFiles(files, append = true) {
  if (state.busy) return;
  const version = ++galleryVersion;
  let valid = true;
  const { accepted, errors } = validateFiles([...files], append ? state.ocrFiles : []);
  state.ocrFiles = accepted; state.ocrImages = []; state.ocrRows = [];
  releasePreviews();
  $('#ocrFiles').value = '';
  $('#imagePreviews').innerHTML = accepted.map((file, index) => {
    const url = URL.createObjectURL(file); previewUrls.push(url);
    return `<figure><img src="${url}" alt="Preview de ${esc(file.name)}"/><figcaption>${esc(file.name)}<button type="button" data-remove-image="${index}" aria-label="Remover ${esc(file.name)}">×</button></figcaption></figure>`;
  }).join('');
  $('#uploadErrors').textContent = errors.join(' ');
  $('#processOcr').disabled = true; state.validating = true; $('#ocrReview').hidden = true;
  for (const [index, image] of $$('#imagePreviews img').entries()) {
    image.onerror = () => { if (version !== galleryVersion) return; valid = false; $('#uploadErrors').textContent = `${accepted[index].name}: falha ao gerar preview. Remova e selecione novamente.`; $('#processOcr').disabled = true; };
  }
  for (const file of accepted) {
    try { const bitmap = await decodeImage(file); const tooLarge = bitmap.width * bitmap.height > 24000000; bitmap.close?.(); if (tooLarge) throw new Error('dimensões acima do limite de 24 megapixels'); }
    catch { if (version !== galleryVersion) return; valid = false; $('#uploadErrors').textContent = `${file.name}: arquivo corrompido ou dimensões acima de 24 megapixels.`; $('#processOcr').disabled = true; }
  }
  if (version === galleryVersion) { state.validating = false; $('#processOcr').disabled = !valid || !accepted.length; }
}
$('#ocrFiles').addEventListener('change', (event) => setOcrFiles(event.target.files));
$('#uploadZone').addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
$('#uploadZone').addEventListener('dragleave', (event) => event.currentTarget.classList.remove('dragging'));
$('#uploadZone').addEventListener('drop', (event) => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); setOcrFiles(event.dataTransfer.files); });
$('#imagePreviews').addEventListener('click', (event) => { if (event.target.dataset.removeImage !== undefined && !state.busy) { state.ocrFiles.splice(Number(event.target.dataset.removeImage), 1); setOcrFiles(state.ocrFiles, false); } });

function bindReview() { state.reviewFaction = $('#ocrFaction').value; state.reviewType = $('input[name="relationType"]:checked').value; }
function matchName(name) { const normalized = normalizeGangName(name); return state.catalog.find((g) => normalizeGangName(g.name) === normalized || (g.aliases || []).some((a) => normalizeGangName(a) === normalized)); }
function renderOcrRows() {
  const manual = state.inputSource === 'MANUAL';
  $('#confirmOcr').textContent = manual ? 'SALVAR LISTA' : 'CONFIRMAR LISTA';
  $('#ocrReview h3').textContent = manual ? 'Lista manual' : 'Revisar leitura';
  $('#ocrReview .kicker').textContent = manual ? 'DIGITE OS NOMES E SALVE A LISTA' : 'REVISÃO HUMANA OBRIGATÓRIA';
  $('#ocrRows').innerHTML = state.ocrRows.map((row, index) => {
    const match = matchName(row.name); row.gangId = match?.id || null;
    return `<div class="ocr-row"><div><small>OCR original: ${esc(row.originalText)} · Origem: ${esc(row.origin || 'Manual')}</small><label>Nome corrigido<input data-ocr-name="${index}" value="${esc(row.name)}" maxlength="100" /></label><p class="row-match">${match ? `Nome canônico: ${esc(match.name)} · ${normalizeGangName(match.name) !== normalizeGangName(row.name) ? 'ALIAS ENCONTRADO' : 'POSSÍVEL CORRESPONDÊNCIA'}` : 'NOVA GANGUE'}</p><span class="badge">${manual ? 'ENTRADA MANUAL' : row.confirmed ? 'CONFIRMADO' : row.confidence < 70 ? 'REVISAR OCR · BAIXA CONFIANÇA' : 'REVISAR OCR'}</span>${manual ? '' : `<label><input type="checkbox" data-confirm-row="${index}" ${row.confirmed ? 'checked' : ''}/> Confirmar nome</label>`}</div><span class="confidence ${row.confidence < 70 ? 'low' : ''}">${row.confidence}%</span><div><button type="button" data-edit-row="${index}">EDITAR</button><button type="button" data-remove-row="${index}" aria-label="Remover nome ${esc(row.name)}">REMOVER</button></div></div>`;
  }).join('');
}
function progress(stage, value = 0) { $('#ocrProgress').hidden = false; $('#ocrProgress strong').textContent = stage; $('#ocrProgress progress').value = value; }
function setBusy(busy) { state.busy = busy; for (const el of $$('#ocr button, #ocr select, #ocr input')) el.disabled = busy; if (!busy) $('#processOcr').disabled = !state.ocrFiles.length; }
$('#processOcr').addEventListener('click', async () => {
  if (state.busy || state.validating) return;
  if (!$('#ocrFaction').value) return toast('Escolha primeiro a FAC dona da lista.', true);
  setBusy(true); $('#ocrReview').hidden = true; state.ocrRows = []; state.ocrImages = []; state.inputSource = 'OCR';
  try {
    for (let i = 0; i < state.ocrFiles.length; i++) {
      const file = state.ocrFiles[i];
      const result = await provider.recognize(file, (value, stage = 'executando OCR') => { progress(`${stage} · imagem ${i + 1} de ${state.ocrFiles.length}`, (i * 100 + value) / state.ocrFiles.length); });
      state.ocrRows.push(...result.rows.map((row) => ({ ...row, imageIndexes: [i], origin: file.name, confirmed: false })));

    }
    progress('Normalizando nomes e comparando aliases', 100); await new Promise(requestAnimationFrame);
    // Keep every origin for review; backend deduplicates by master entity on confirmation.
    bindReview(); renderOcrRows(); $('#ocrReview').hidden = false; progress('Preparando revisão', 100);
    if (!state.ocrRows.length) toast('Nenhum nome reconhecido. Adicione manualmente ou tente um print mais legível.', true);
  } catch { $('#uploadErrors').textContent = 'Falha durante OCR. Confira a conexão, o formato da imagem e tente novamente.'; }
  finally { $('#ocrProgress').hidden = true; setBusy(false); }
});
$('#ocrRows').addEventListener('input', (event) => {
  if (event.target.dataset.ocrName !== undefined) {
    const row = state.ocrRows[Number(event.target.dataset.ocrName)]; row.name = event.target.value; row.confirmed = false; row.gangId = matchName(row.name)?.id || null;
    const container = event.target.closest('.ocr-row'); const checkbox = container.querySelector('[type=checkbox]'); if (checkbox) checkbox.checked = false; container.querySelector('.badge').textContent = state.inputSource === 'MANUAL' ? 'ENTRADA MANUAL' : 'REVISAR OCR'; container.querySelector('.row-match').textContent = row.gangId ? `Nome canônico: ${matchName(row.name).name} · POSSÍVEL CORRESPONDÊNCIA` : 'NOVA GANGUE';
  }
});
$('#ocrRows').addEventListener('change', (event) => { if (event.target.dataset.confirmRow !== undefined) { state.ocrRows[Number(event.target.dataset.confirmRow)].confirmed = event.target.checked; renderOcrRows(); } });
$('#ocrRows').addEventListener('click', (event) => {
  if (event.target.dataset.removeRow !== undefined) { state.ocrRows.splice(Number(event.target.dataset.removeRow), 1); renderOcrRows(); }
  if (event.target.dataset.editRow !== undefined) $(`[data-ocr-name="${event.target.dataset.editRow}"]`).focus();
});
$('#addOcrRow').addEventListener('click', () => { state.ocrRows.push({ name: '', originalText: 'Adição manual', confidence: 100, imageIndexes: [], confirmed: false }); renderOcrRows(); $$('#ocrRows input[data-ocr-name]').at(-1)?.focus(); });
$('#manualList').addEventListener('click', () => {
  if (!$('#ocrFaction').value) return toast('Escolha a FAC de origem.', true);
  state.ocrRows = []; state.ocrImages = []; state.inputSource = 'MANUAL'; bindReview(); renderOcrRows(); $('#ocrReview').hidden = false; $('#addOcrRow').click();
});
$('#confirmOcr').addEventListener('click', async () => {
  if (state.busy) return;
  if (state.reviewFaction !== $('#ocrFaction').value || state.reviewType !== $('input[name="relationType"]:checked').value) return toast('A FAC ou o tipo mudou. Volte à seleção original ou inicie uma nova revisão.', true);
  const manual = state.inputSource === 'MANUAL', sourceFactionId = state.reviewFaction;
  // Clicking Save is the explicit human confirmation for names typed manually.
  const entries = state.ocrRows.map(({ name, originalText, confidence, gangId, confirmed }) => ({ name, originalText: originalText === 'Adição manual' ? name.trim() : originalText, confidence, gangId, confirmed: manual || confirmed }));
  if (entries.some((row) => !row.name.trim())) return toast('Preencha todos os nomes antes de salvar.', true);
  if (entries.some((row) => !row.confirmed)) return toast('Edite e confirme cada nome antes de salvar.', true);
  if (!entries.length && !confirm('Confirmar lista vazia? Todas as relações atuais deste tipo serão removidas, preservando o histórico.')) return;
  const previousConflicts = new Set(state.diplomacy.filter((g) => g.divergence || g.critical).map((g) => g.id));
  setBusy(true); progress('Salvando lista confirmada');
  try {
    const result = await api('diplomacy-submit', { method: 'POST', body: JSON.stringify({ sourceFactionId: $('#ocrFaction').value, relationType: $('input[name="relationType"]:checked').value, importMode: 'COMPLETE', inputSource: state.inputSource, entries }) });
    progress('Atualizando diplomacia'); const refreshed = await loadData();
    if (!refreshed) { $('#ocrReview').hidden = true; $('#ocrSummary').textContent = 'Lista salva. A atualização das consultas falhou; recarregue antes de enviar novamente.'; return; }
    const snapshot = state.history.find((s) => s.id === result.id), diff = snapshot ? snapshotDiff(snapshot, state.history) : { added: [], removed: [] };
    const conflicts = new Set(state.diplomacy.filter((g) => g.divergence || g.critical).map((g) => g.id));
    $('#ocrSummary').innerHTML = `<h3>Lista confirmada</h3><p>${result.entries} nomes · Adicionados: ${diff.added.map((e) => esc(e.name)).join(', ') || 'nenhum'} · Removidos: ${diff.removed.map((e) => esc(e.name)).join(', ') || 'nenhum'}</p><p>Divergências novas: ${[...conflicts].filter((id) => !previousConflicts.has(id)).length} · Resolvidas: ${[...previousConflicts].filter((id) => !conflicts.has(id)).length}</p><a href="#fac/${$('#ocrFaction').value}">VER FAC, ALIADOS E INIMIGOS</a>`;
    $('#ocrReview').hidden = true; state.ocrFiles = []; state.ocrRows = []; releasePreviews(); $('#imagePreviews').replaceChildren(); $('#ocrFiles').value = ''; toast(manual ? 'Lista manual salva.' : 'Lista confirmada e consolidada.');
    if (manual) location.hash = `fac/${sourceFactionId}`;
  } catch (error) { toast(error.message, true); }
  finally { $('#ocrProgress').hidden = true; setBusy(false); }
});

function conflictCard(gang) {
  return `<article class="relation-card enemy"><div><strong class="critical">${gang.critical ? '🚨 CONFLITO CRÍTICO — BLACKLIST × ALIADO' : '⚠ DIVERGÊNCIA DIPLOMÁTICA'}</strong><h3><a href="#gangue/${gang.id}">${esc(gang.name)}</a></h3><p>Blacklist: ${gang.blacklisted ? 'ATIVA' : 'não consta como ativa'} · Alerta: ${gang.critical ? 'CRÍTICO' : 'ALTO'}</p><b>ALIADA DE:</b><ul>${relationSources(gang.ally_of)}</ul><b>INIMIGA DE:</b><ul>${relationSources(gang.enemy_of)}</ul><a href="#gangue/${gang.id}">DETALHES E CORREÇÃO DAS LISTAS</a></div></article>`;
}
function coverage(gang) {
  const active = state.factions.filter((f) => f.status === 'active');
  const missing = gang?.missing || active, count = active.length - missing.length;
  return `<p>COBERTURA: ${count}/${active.length} — ${gang?.coverage || 0}%</p><span class="badge">${missing.length ? 'PENDÊNCIA' : active.length ? 'COBERTURA COMPLETA' : 'SEM FAC ATIVA'}</span>${gang?.critical ? '<strong class="critical">CONFLITO COM ALIADO</strong>' : ''}<details><summary>FACs com guerra e pendências</summary><b>POSSUEM GUERRA:</b><ul>${relationSources(gang?.enemy_of || [])}</ul><b>NÃO POSSUEM:</b><ul>${missing.map((f) => `<li>⚠ <a href="#fac/${f.id}">${esc(f.name)}</a></li>`).join('')}</ul></details>`;
}
// Preserve the existing Blacklist management; add computed coverage alongside it.
const renderBaseBlacklist = renderBlacklist;
renderBlacklist = function () {
  renderBaseBlacklist();
  const filter = $('#coverageFilter')?.value || 'all';
  for (const article of $$('#relationList article')) {
    const name = article.querySelector('h3').textContent;
    const item = state.blacklist.find((b) => b.name === name), gang = state.diplomacy.find((g) => g.id === item?.gang_id);
    article.querySelector('div:nth-child(2)').insertAdjacentHTML('beforeend', coverage(gang) + (gang ? `<a href="#gangue/${gang.id}">DETALHES / HISTÓRICO</a>` : ''));
    article.hidden = filter === 'full' ? !gang || gang.missing.length > 0 : filter === 'pending' ? gang?.missing.length === 0 : filter === 'conflict' ? !gang?.critical : false;
  }
};
function historyCards(snapshots) {
  return snapshots.map((s) => {
    const diff = snapshotDiff(s, state.history);
    return `<details id="snapshot-${s.id}" class="history-card"><summary>${esc(s.source_name)} · ${s.relation_type === 'ALLY' ? 'Aliados' : 'Inimigos'} · ${formatDate(s.confirmed_at)} · ${s.status}</summary><p>Snapshot ${s.id} · ${s.import_mode} · Origem ${s.input_source || 'OCR'}</p><p>Adicionados: ${diff.added.map((e) => esc(e.name)).join(', ') || 'nenhum'} · Removidos: ${diff.removed.map((e) => esc(e.name)).join(', ') || 'nenhum'}</p><ul>${(s.entries || []).map((e) => `<li><a href="#gangue/${e.target_gang_id}">${esc(e.name)}</a> · Corrigido: ${esc(e.reviewed_name || e.name)} · OCR: ${esc(e.originalText)} · ${e.confidence}%</li>`).join('')}</ul></details>`;
  }).join('') || '<p>Nenhum snapshot disponível.</p>';
}
function renderPages() {
  const conflicts = state.diplomacy.filter((g) => g.divergence || g.critical);
  $('#conflictList').innerHTML = conflicts.map(conflictCard).join('') || '<p>Nenhuma divergência nos snapshots atuais.</p>';
  $('#priorityAlerts').innerHTML = `<h3>Alertas prioritários (${conflicts.length})</h3>${conflicts.slice(0, 3).map((g) => `<p><a href="#gangue/${g.id}">${g.critical ? '🚨' : '⚠'} ${esc(g.name)}</a></p>`).join('') || '<p>Sem alertas atuais.</p>'}<a href="#divergencias">VER TODAS AS DIVERGÊNCIAS</a>`;
  const active = state.factions.filter((f) => f.status === 'active');
  const metrics = [
    ['Inimigos únicos', state.diplomacy.filter((g) => g.is_enemy).length], ['Guerras compartilhadas', state.diplomacy.filter((g) => g.enemy_of.length > 1).length],
    ['Pendências da Blacklist', state.blacklist.filter((b) => b.status === 'active').reduce((n, b) => n + (state.diplomacy.find((g) => g.id === b.gang_id)?.missing.length ?? active.length), 0)],
    ['Aliados únicos', state.diplomacy.filter((g) => g.is_ally).length], ['Aliados com 100%', state.diplomacy.filter((g) => g.is_ally && g.percentage === 100).length],
    ['Divergências diplomáticas', state.diplomacy.filter((g) => g.divergence).length], ['Conflitos críticos', state.diplomacy.filter((g) => g.critical).length]
  ];
  $$('.computed-card').forEach((el) => el.remove());
  $('#dashboardCards').insertAdjacentHTML('beforeend', metrics.map(([name, count]) => `<article class="card computed-card"><div><small>${name}</small><strong>${count}</strong></div></article>`).join(''));
  $('#historyList').innerHTML = historyCards(state.history);
  for (const selector of $$('.faction-filter')) {
    const selected = selector.value;
    selector.innerHTML = '<option value="">Todas as FACs</option>' + active.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join(''); selector.value = selected;
  }
  renderDetails();
}
function renderDetails() {
  const [route, id] = location.hash.slice(1).split('/');
  if (route === 'fac') {
    const faction = state.factions.find((f) => f.id === id);
    if (!faction) { $('#factionDetail').innerHTML = '<h2>FAC não encontrada</h2>'; return; }
    const allies = state.diplomacy.filter((g) => g.ally_of.some((f) => f.id === id)), enemies = state.diplomacy.filter((g) => g.enemy_of.some((f) => f.id === id));
    const activeBlacklist = state.blacklist.filter((b) => b.status === 'active');
    const covered = activeBlacklist.filter((b) => enemies.some((g) => g.id === b.gang_id));
    const missing = activeBlacklist.filter((b) => !enemies.some((g) => g.id === b.gang_id));
    const conflicts = [...new Set([...allies, ...enemies])].filter((g) => g.divergence || g.critical);
    const lists = (items, type) => items.map((g) => `<li><a href="#gangue/${g.id}">${esc(g.name)}</a> <button data-edit-list="${id}" data-type="${type}" data-target="${g.id}">EDITAR</button></li>`).join('') || '<li>Lista vazia</li>';
    $('#factionDetail').innerHTML = `<h2>${esc(faction.name)}</h2><p>${faction.status === 'active' ? 'ATIVA' : 'INATIVA'} · Blacklist: ${covered.length}/${activeBlacklist.length} · Inimigos normais: ${enemies.filter((g) => !g.blacklisted).length} · Aliados: ${allies.length} · Divergências: ${conflicts.length}</p><button class="text-button" id="editFactionDetails">EDITAR FAC / RESPONSÁVEIS</button><h3>Responsáveis</h3>${memberBlocks(faction.members)}<h3>Aliados atuais</h3><button data-edit-list="${id}" data-type="ALLY">EDITAR LISTA DE ALIADOS</button><ul>${lists(allies, 'ALLY')}</ul><h3>Inimigos atuais</h3><button data-edit-list="${id}" data-type="ENEMY">EDITAR LISTA DE INIMIGOS</button><ul>${lists(enemies, 'ENEMY')}</ul><details><summary>Blacklist atendida / faltante</summary><p>Atendida: ${covered.map((b) => esc(b.name)).join(', ') || 'nenhuma'}</p><p>Faltante: ${missing.map((b) => esc(b.name)).join(', ') || 'nenhuma'}</p></details><h3>Conflitos</h3>${conflicts.map(conflictCard).join('') || '<p>Nenhum conflito.</p>'}<h3>Histórico de aliados</h3>${historyCards(state.history.filter((s) => s.source_faction_id === id && s.relation_type === 'ALLY'))}<h3>Histórico de inimigos</h3>${historyCards(state.history.filter((s) => s.source_faction_id === id && s.relation_type === 'ENEMY'))}`;
    $('#editFactionDetails').onclick = () => openFaction(faction);
  }
  if (route === 'gangue') {
    const gang = state.diplomacy.find((g) => g.id === id);
    $('#gangDetail').innerHTML = gang ? `<h2>${esc(gang.name)}</h2><p>Aliases: ${(gang.aliases || []).map(esc).join(', ') || 'nenhum'}</p><p>Organização: ${gang.is_organization ? 'SIM' : 'NÃO'} · Blacklist: ${gang.blacklisted ? 'ATIVA' : 'NÃO ATIVA'}</p><h3>Aliada de</h3><ul>${relationSources(gang.ally_of)}</ul><h3>Tem guerra com</h3><ul>${relationSources(gang.enemy_of)}</ul><p>Coincidência de aliados: ${gang.ally_count}/${gang.expected} · ${gang.percentage}%</p>${gang.blacklisted ? coverage(gang) : ''}${gang.divergence || gang.critical ? conflictCard(gang) : ''}<h3>Histórico</h3>${historyCards(state.history.filter((s) => s.entries.some((e) => e.target_gang_id === id)))}` : '<h2>Gangue não encontrada</h2>';
  }
  if (route === 'historico' && id) { const card = document.getElementById(`snapshot-${id}`); if (card) card.open = true; }
}
function editList(factionId, type, target) {
  if (state.busy) return toast('Aguarde a operação atual.', true);
  if (!state.factions.some((f) => f.id === factionId && f.status === 'active')) return toast('FAC inativa: ative antes de editar a lista.', true);
  if (!$('#ocrReview').hidden && !confirm('Substituir a revisão atual pela edição desta lista?')) return;
  const snapshot = currentSnapshots(state.history).find((s) => s.source_faction_id === factionId && s.relation_type === type);
  $('#ocrFaction').value = factionId; $(`input[name="relationType"][value="${type}"]`).checked = true;
  state.inputSource = 'MANUAL'; state.ocrImages = [];
  state.ocrRows = (snapshot?.entries || []).map((e) => ({ name: e.name, gangId: e.target_gang_id, originalText: e.originalText || e.name, confidence: Number(e.confidence ?? 100), imageIndexes: [], origin: 'Edição manual', confirmed: true }));
  bindReview(); renderOcrRows(); $('#ocrReview').hidden = false; location.hash = 'ocr';
  if (target) setTimeout(() => { const index = state.ocrRows.findIndex((r) => r.gangId === target); $(`[data-ocr-name="${index}"]`)?.focus(); }, 0);
}
document.addEventListener('click', (event) => { const button = event.target.closest('[data-edit-list]'); if (button) editList(button.dataset.editList, button.dataset.type, button.dataset.target); });
for (const [id, options] of [['enemy', [['shared','Compartilhados'],['three','3 ou mais FACs'],['blacklist','Blacklist'],['outside','Fora da Blacklist'],['divergence','Divergências']]], ['ally', [['exclusive','Exclusivos'],['shared','Compartilhados'],['full','100%'],['candidate','Candidatos'],['divergence','Divergências']]]]) {
  $(`#${id}List`).insertAdjacentHTML('beforebegin', `<div class="relation-toolbar"><label>Filtrar<select id="${id}Filter"><option value="all">Todos</option>${options.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label>FAC<select class="faction-filter" id="${id}FactionFilter"><option value="">Todas as FACs</option></select></label></div>`);
  $(`#${id}Filter`).addEventListener('change', renderDiplomacy); $(`#${id}FactionFilter`).addEventListener('change', renderDiplomacy);
}
$('#relationList').insertAdjacentHTML('beforebegin','<label>Cobertura<select id="coverageFilter"><option value="all">Todas</option><option value="full">Cobertura completa</option><option value="pending">Pendentes</option><option value="conflict">Conflito com aliado</option></select></label>');
$('#coverageFilter').addEventListener('change', renderBlacklist);
$('#openBlacklistAdmin').onclick = () => $('#manageRelations').click();
function navigate() {
  const route = location.hash.slice(1).split('/')[0] || 'inicio';
  const known = ['inicio','ocr','inimigos','aliados','blacklist','facs','divergencias','historico','fac','gangue','admin'];
  const page = known.includes(route) ? route : 'inicio';
  for (const section of $$('main > section')) section.hidden = !(section.id === page || (page === 'inicio' && section.id === 'operacoes'));
  for (const link of $$('nav a')) { const active = link.hash === `#${page}` || page === 'fac' && link.hash === '#facs'; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); }
  nav.classList.remove('open'); menu.setAttribute('aria-expanded','false');
  renderDetails(); const heading = $(`main > section:not([hidden]) h2, main > section:not([hidden]) h1`);
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); document.title = `${heading.textContent} · Revolucionários`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);
// Focus remains inside the foremost dialog and returns to the opening control.
let dialogReturnFocus;
new MutationObserver(() => {
  const dialogs = $$('.admin-modal:not([hidden]), .modal:not([hidden])');
  if (dialogs.length && !dialogReturnFocus) { dialogReturnFocus = document.activeElement; dialogs.at(-1).querySelector('button,input,select')?.focus(); }
  if (!dialogs.length && dialogReturnFocus) { dialogReturnFocus.focus(); dialogReturnFocus = null; document.body.classList.remove('modal-open'); }
}).observe($('#app'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('keydown', (event) => {
  const dialog = $$('.admin-modal:not([hidden]), .modal:not([hidden])').at(-1); if (!dialog) return;
  const controls = $$('button:not([disabled]),input:not([type=hidden]),select,textarea,a[href]', dialog).filter((e) => e.getClientRects().length);
  if (event.key === 'Tab' && controls.length) {
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
  if (event.key === 'Escape') dialog.querySelector('.modal-close, #cancelCredential')?.click();
});
import { TesseractOcrProvider, normalizeGangName } from './ocr-provider.js';
navigate(); loadData();

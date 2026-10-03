import './styles.css';

const installButton = document.querySelector('#installButton');
const modal = document.querySelector('.modal');
const modalTitle = document.querySelector('#modalTitle');
const modalText = document.querySelector('#modalText');
let installPrompt;

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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });

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

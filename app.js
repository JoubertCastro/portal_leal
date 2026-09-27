const cpf = document.getElementById('cpf');
const error = document.getElementById('cpf-error');
const dialog = document.getElementById('access-dialog');
function validCpf(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(digits[length])) return false;
  }
  return true;
}
cpf.addEventListener('input', () => {
  const d = cpf.value.replace(/\D/g, '').slice(0, 11);
  cpf.value = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  cpf.removeAttribute('aria-invalid'); error.hidden = true;
});
document.getElementById('access-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!validCpf(cpf.value)) {
    error.textContent = 'Confira o CPF e informe os 11 dígitos corretamente.';
    error.hidden = false; cpf.setAttribute('aria-invalid', 'true');
    cpf.setAttribute('aria-describedby', 'privacy cpf-error'); cpf.focus(); return;
  }
  document.getElementById('code-form').reset();
  document.getElementById('code-message').hidden = true;
  dialog.showModal();
});
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => cpf.focus());
document.getElementById('code').addEventListener('input', e => {e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);});
document.getElementById('code-form').addEventListener('submit', event => {
  event.preventDefault();
  const message = document.getElementById('code-message');
  message.hidden = false;
  message.textContent = document.getElementById('code').value.length !== 6 ? 'Informe um código com 6 dígitos.' : 'Demonstração concluída. A confirmação de identidade e a consulta de dívidas dependem da integração com o sistema da Leal.';
});

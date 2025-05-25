document.addEventListener('DOMContentLoaded', () => {
  const errorMessageP = document.getElementById('errorMessage');
  const params = new URLSearchParams(window.location.search);
  const message = params.get('message');

  if (message) {
    errorMessageP.textContent = decodeURIComponent(message);
  }
});
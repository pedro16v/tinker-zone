document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    const capybara = document.getElementById('capybara');
    capybara.classList.remove('jumping');
    void capybara.offsetWidth;
    capybara.classList.add('jumping');
  }
});

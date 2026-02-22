(() => {
  const toggleBtns = Array.from(document.querySelectorAll(".mk-toggle-btn"));
  const priceEls = Array.from(document.querySelectorAll(".mk-price-value"));
  if (!toggleBtns.length || !priceEls.length) return;

  function setBilling(mode) {
    toggleBtns.forEach((btn) => {
      btn.classList.toggle("mk-toggle-btn--active", btn.dataset.billing === mode);
    });

    priceEls.forEach((el) => {
      const monthly = el.getAttribute("data-price-monthly");
      const yearly = el.getAttribute("data-price-yearly");
      const value = mode === "yearly" ? yearly : monthly;
      if (!value) return;
      el.classList.remove("mk-price-pop");
      // trigger reflow so animation plays each change
      void el.offsetWidth;
      el.textContent = `$${value}`;
      el.classList.add("mk-price-pop");
    });
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => setBilling(btn.dataset.billing));
  });

  setBilling("monthly");
})();


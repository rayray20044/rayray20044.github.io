// Shared behaviour for case study pages
(function () {
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    var nav = document.getElementById('nav');
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var menuBtn = document.getElementById('menuBtn');
    var navLinks = document.getElementById('navLinks');
    menuBtn.addEventListener('click', function () {
        var open = navLinks.classList.toggle('open');
        menuBtn.classList.toggle('open', open);
        menuBtn.setAttribute('aria-expanded', open);
    });

    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.12 });
        document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else {
        document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }
})();

// Первым делом ставим перехват ошибок: если цикл анимации упадёт,
// время и движение встанут, а без этого лога причину не видно.
window.__earlyErrs = [];
window.addEventListener('error', function (ev) {
    window.__earlyErrs.push(String(ev.message || ev.error).slice(0, 160));
});
window.addEventListener('unhandledrejection', function (ev) {
    window.__earlyErrs.push('promise: ' + String(ev.reason).slice(0, 140));
});

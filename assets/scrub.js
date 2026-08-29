(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isPortrait = matchMedia('(max-width: 880px)').matches;
  var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  var viewportUnit = window.CSS && CSS.supports && CSS.supports('height', '100svh') ? 'svh' : 'vh';
  var clamp = function (value, min, max) { return value < min ? min : value > max ? max : value; };

  function build(section) {
    var clip = isPortrait && section.dataset.clipM ? section.dataset.clipM : section.dataset.clip;
    var poster = isPortrait && section.dataset.posterM ? section.dataset.posterM : section.dataset.poster;
    var screens = Math.max(1, parseFloat(section.dataset.scroll) || 3);
    var bands = Array.prototype.slice.call(section.querySelectorAll('.rd-scrub__band'));
    var stage = document.createElement('div');
    var media = document.createElement('div');
    var scrim = document.createElement('div');
    var copy = document.createElement('div');
    var cue = document.createElement('div');
    var progressBar = document.createElement('div');

    stage.className = 'rd-scrub__stage';
    media.className = 'rd-scrub__media';
    media.setAttribute('aria-hidden', 'true');
    if (poster) {
      var image = document.createElement('img');
      image.className = 'rd-scrub__poster';
      image.src = poster;
      image.alt = '';
      image.setAttribute('fetchpriority', 'high');
      media.appendChild(image);
    }
    stage.appendChild(media);

    scrim.className = 'rd-scrub__scrim';
    stage.appendChild(scrim);
    copy.className = 'rd-scrub__copy';
    bands.forEach(function (band) { copy.appendChild(band); });
    stage.appendChild(copy);

    cue.className = 'rd-scrub__cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = '<span>' + (section.dataset.cue || 'SCROLL') + '</span><i></i>';
    stage.appendChild(cue);
    progressBar.className = 'rd-scrub__progress';
    progressBar.innerHTML = '<i></i>';
    stage.appendChild(progressBar);

    section.innerHTML = '';
    section.appendChild(stage);

    if (reduced || !clip) {
      section.classList.add('rd-scrub--static');
      return;
    }

    section.classList.add('rd-scrub--live');
    section.style.height = ((screens + 1) * 100) + viewportUnit;
    var state = { video: null, ready: false, loading: false, target: 0, current: 0 };

    function load() {
      if (state.loading || state.ready) return;
      state.loading = true;
      var video = document.createElement('video');
      video.className = 'rd-scrub__video';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.addEventListener('loadeddata', function () {
        state.ready = true;
        section.classList.add('rd-scrub--has-video');
      }, { once: true });
      video.addEventListener('error', function () { section.classList.add('rd-scrub--video-failed'); });
      state.video = video;
      media.appendChild(video);

      fetch(clip).then(function (response) {
        if (!response.ok) throw new Error(response.status);
        return response.blob();
      }).then(function (blob) {
        video.src = URL.createObjectURL(blob);
      }).catch(function () {
        video.src = clip;
      });
    }

    var tolerance = (isPortrait || isSafari) ? 0.02 : 0.008;
    function drive() {
      var video = state.video;
      if (video && state.ready && !video.seeking) {
        state.current += (state.target - state.current) * 0.18;
        var time = clamp(state.current, 0, 0.999) * (video.duration || 1);
        if (Math.abs(video.currentTime - time) > tolerance) {
          try { video.currentTime = time; } catch (error) {}
        }
      }
      requestAnimationFrame(drive);
    }

    var ticking = false;
    function getProgress() {
      var rect = section.getBoundingClientRect();
      var range = section.offsetHeight - innerHeight;
      return range <= 0 ? 0 : clamp(-rect.top / range, 0, 1);
    }
    function render() {
      ticking = false;
      var value = getProgress();
      state.target = value;
      progressBar.style.setProperty('--p', value.toFixed(4));
      section.style.setProperty('--cue', value > 0.02 ? 0 : 1);
      bands.forEach(function (band) {
        var start = parseFloat(band.dataset.a);
        var end = parseFloat(band.dataset.b);
        if (isNaN(start) || isNaN(end)) band.classList.add('on');
        else band.classList.toggle('on', value >= start && value <= end);
      });
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          load();
          observer.disconnect();
        }
      }, { rootMargin: '60% 0px' });
      observer.observe(section);
    } else {
      load();
    }

    addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(render);
      }
    }, { passive: true });
    addEventListener('resize', render);
    render();
    requestAnimationFrame(drive);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.rd-scrub'), build);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

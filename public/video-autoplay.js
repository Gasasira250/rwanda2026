document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     VIDEO AUTOPLAY
     ========================================================= */

  const videos = document.querySelectorAll("video");

  const attemptPlay = (video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;

    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                attemptPlay(entry.target);
              }
            });
          },
          { threshold: 0.35 }
        )
      : null;

  videos.forEach((video) => {
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;

    video.setAttribute("autoplay", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("disableremoteplayback", "");
    video.setAttribute("preload", "metadata");

    video.removeAttribute("controls");

    video.addEventListener(
      "loadedmetadata",
      () => attemptPlay(video),
      { once: true }
    );

    video.addEventListener(
      "canplay",
      () => attemptPlay(video),
      { once: true }
    );

    if (observer) {
      observer.observe(video);
    } else {
      attemptPlay(video);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      videos.forEach((video) => attemptPlay(video));
    }
  });

  window.addEventListener("pageshow", () => {
    videos.forEach((video) => attemptPlay(video));
  });
  /* =========================================================
     HOMEPAGE CAROUSEL
     ========================================================= */

  const carousel = document.querySelector(".home-carousel");

  if (!carousel) {
    return;
  }

  const slides = carousel.querySelectorAll(".carousel-slide");
  const previousButton = carousel.querySelector(".carousel-prev");
  const nextButton = carousel.querySelector(".carousel-next");
  const dotsContainer = carousel.querySelector(".carousel-dots");

  if (!slides.length) {
    return;
  }

  let currentSlide = 0;

  let dots = [];

  if (dotsContainer) {
    dotsContainer.innerHTML = "";

    slides.forEach((_, index) => {
      const dot = document.createElement("button");

      dot.type = "button";
      dot.className = "carousel-dot";
      dot.setAttribute("aria-label", `Go to slide ${index + 1}`);

      dot.addEventListener("click", () => {
        showSlide(index);
      });

      dotsContainer.appendChild(dot);
    });

    dots = dotsContainer.querySelectorAll(".carousel-dot");
  }

  function showSlide(index) {
    if (index < 0) {
      index = slides.length - 1;
    }

    if (index >= slides.length) {
      index = 0;
    }

    currentSlide = index;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentSlide;

      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");

      const video = slide.querySelector("video");

      if (video) {
        video.muted = true;
        video.defaultMuted = true;

        if (active) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle(
        "active",
        dotIndex === currentSlide
      );
    });
  }

  if (previousButton) {
    previousButton.addEventListener("click", () => {
      showSlide(currentSlide - 1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      showSlide(currentSlide + 1);
    });
  }

  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      showSlide(currentSlide - 1);
    }

    if (event.key === "ArrowRight") {
      showSlide(currentSlide + 1);
    }
  });

  showSlide(0);

  let carouselTimer = setInterval(() => {
    showSlide(currentSlide + 1);
  }, 7000);

  carousel.addEventListener("mouseenter", () => {
    clearInterval(carouselTimer);
  });

  carousel.addEventListener("mouseleave", () => {
    carouselTimer = setInterval(() => {
      showSlide(currentSlide + 1);
    }, 7000);
  });

});

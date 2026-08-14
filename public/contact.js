(function () {
  const form = document.getElementById("contact-form-element");
  const submitButton = document.getElementById("contact-submit");
  const note = document.getElementById("contact-form-note");

  if (!form || !submitButton || !note) {
    return;
  }

  const setNote = (message, state) => {
    note.textContent = message;
    note.dataset.state = state || "idle";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      setNote("Please complete your name, email, and message before sending.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setNote("Sending your message now...", "pending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to send message right now.");
      }

      form.reset();
      setNote("Thank you. Your message has been sent successfully.", "success");
    } catch (error) {
      setNote(error.message || "Something went wrong while sending your message.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send Message";
    }
  });
})();

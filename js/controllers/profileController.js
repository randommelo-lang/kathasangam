import { openMfaSetup, openMfaDisable, openEmailOtpSetup, openEmailOtpDisable } from "../auth.js";

function setFormFeedback(container, message, type) {
  if (!container) return;
  var existing = container.querySelectorAll(".form-feedback");
  existing.forEach(function (e) { e.remove(); });
  
  if (!message) return;
  
  var feedback = document.createElement("p");
  feedback.className = "form-feedback " + (type || "info");
  feedback.textContent = message;
  
  var row = container.querySelector(".settings-field-row, .settings-field-row-wrap");
  if (row) {
    row.parentNode.insertBefore(feedback, row.nextSibling);
  } else {
    container.appendChild(feedback);
  }
}

function setButtonLoading(btn, isLoading, originalText) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = originalText || "Saving...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }
}

export function handleProfileClick(ctx, action, target, e) {
  if (action === "profileTab") {
    ctx.ui.currentView = target.dataset.value;
    window.location.hash = target.dataset.value;
    ctx.render();
    return true;
  }
  if (action === "openMfaSetup") {
    openMfaSetup(ctx);
    return true;
  }
  if (action === "openMfaDisable") {
    openMfaDisable(ctx);
    return true;
  }
  if (action === "openEmailOtpSetup") {
    openEmailOtpSetup(ctx);
    return true;
  }
  if (action === "openEmailOtpDisable") {
    openEmailOtpDisable(ctx);
    return true;
  }
  if (action === "updateUsername") {
    var group = target.closest(".settings-group");
    var row = target.closest(".settings-field-row");
    var uInput = row ? row.querySelector("input[name='username']") : null;
    var newUsername = uInput ? uInput.value.trim() : "";
    
    setFormFeedback(group, "", "");

    if (!newUsername) {
      setFormFeedback(group, "Username cannot be empty. Please check your input and try again.", "error");
      return true;
    }
    
    setButtonLoading(target, true, "Updating...");
    ctx.apiPut("/profile", { username: newUsername }).then(function () {
      setButtonLoading(target, false);
      setFormFeedback(group, "Username updated successfully!", "success");
      if (ctx.state.profile) ctx.state.profile.username = newUsername;
      setTimeout(function () {
        ctx.render();
      }, 1000);
    }).catch(function (err) {
      setButtonLoading(target, false);
      console.error(err);
      var msg = "Failed to update username.";
      if (err.status === 409) {
        msg = "Username is already taken.";
      } else if (err.message) {
        msg = err.message;
      }
      setFormFeedback(group, msg + " Please check your input and try again.", "error");
    });
    return true;
  }
  if (action === "updateBio") {
    var group = target.closest(".settings-group");
    var panel = target.closest(".profile-settings-panel");
    var txtArea = panel ? panel.querySelector("textarea[name='bio']") : null;
    var newBio = txtArea ? txtArea.value.trim() : "";
    
    setFormFeedback(group, "", "");
    
    setButtonLoading(target, true, "Updating...");
    ctx.apiPut("/profile", { bio: newBio }).then(function () {
      setButtonLoading(target, false);
      setFormFeedback(group, "Bio updated successfully!", "success");
      if (ctx.state.profile) ctx.state.profile.bio = newBio;
      setTimeout(function () {
        ctx.render();
      }, 1000);
    }).catch(function (err) {
      setButtonLoading(target, false);
      console.error(err);
      setFormFeedback(group, (err.message || "Failed to update bio.") + " Please check your input and try again.", "error");
    });
    return true;
  }
  if (action === "updatePreferences") {
    var group = target.closest(".settings-group");
    var panel = target.closest(".profile-settings-panel");
    var themeSelect = panel ? panel.querySelector("select[name='reader_theme']") : null;
    var modeSelect = panel ? panel.querySelector("select[name='reader_mode']") : null;
    var sizeInput = panel ? panel.querySelector("input[name='reader_size']") : null;
    var emailCheck = panel ? panel.querySelector("input[name='email_notifications']") : null;
    var inAppCheck = panel ? panel.querySelector("input[name='in_app_notifications']") : null;
 
    var themeVal = themeSelect ? themeSelect.value : "light";
    var modeVal = modeSelect ? modeSelect.value : "scroll";
    var sizeVal = sizeInput ? Number(sizeInput.value) : 19;
    var emailVal = emailCheck ? emailCheck.checked : true;
    var inAppVal = inAppCheck ? inAppCheck.checked : true;
 
    setFormFeedback(group, "", "");

    if (sizeVal < 16 || sizeVal > 26) {
      setFormFeedback(group, "Font size must be between 16 and 26px. Please check your input and try again.", "error");
      return true;
    }
 
    var prefs = {
      reader_theme: themeVal,
      reader_size: sizeVal,
      reader_mode: modeVal,
      email_notifications: emailVal,
      in_app_notifications: inAppVal
    };
 
    setButtonLoading(target, true, "Saving...");
    ctx.apiPut("/profile", { preferences: prefs }).then(function () {
      setButtonLoading(target, false);
      setFormFeedback(group, "Preferences updated successfully!", "success");
      if (ctx.state.profile) ctx.state.profile.preferences = prefs;
      ctx.ui.readerTheme = themeVal;
      ctx.ui.readerSize = sizeVal;
      ctx.ui.readerMode = modeVal;
      setTimeout(function () {
        ctx.render();
      }, 1000);
    }).catch(function (err) {
      setButtonLoading(target, false);
      console.error(err);
      setFormFeedback(group, (err.message || "Failed to update preferences.") + " Please check your input and try again.", "error");
    });
    return true;
  }
  if (action === "deleteAccount") {
    window.showConfirm({
      title: "Delete Account",
      message: "ARE YOU SURE you want to delete your account? This will permanently delete your profile, stories, comments, and all related data. This action is irreversible!",
      confirmText: "Delete Permanently",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      setButtonLoading(target, true, "Deleting...");
      ctx.apiDelete("/profile").then(function () {
        setButtonLoading(target, false);
        ctx.notify("Account deleted successfully.");
        ctx.handleSignOut();
      }).catch(function (err) {
        setButtonLoading(target, false);
        console.error(err);
        ctx.notify(err.message || "Failed to delete account.");
      });
    });
    return true;
  }
  return false;
}

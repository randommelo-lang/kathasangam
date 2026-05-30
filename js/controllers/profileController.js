export function handleProfileClick(ctx, action, target, e) {
  if (action === "profileTab") {
    ctx.ui.currentView = target.dataset.value;
    window.location.hash = target.dataset.value;
    ctx.render();
    return true;
  }
  if (action === "updateUsername") {
    var row = target.closest(".settings-field-row");
    var uInput = row ? row.querySelector("input[name='username']") : null;
    var newUsername = uInput ? uInput.value.trim() : "";
    if (!newUsername) {
      ctx.notify("Username cannot be empty.");
      return true;
    }
    ctx.apiPut("/profile", { username: newUsername }).then(function () {
      ctx.notify("Username updated successfully.");
      if (ctx.state.profile) ctx.state.profile.username = newUsername;
      ctx.render();
    }).catch(function (err) {
      console.error(err);
      if (err.status === 409) {
        ctx.notify("Username is already taken.");
      } else {
        ctx.notify(err.message || "Failed to update username.");
      }
    });
    return true;
  }
  if (action === "updateAvatar") {
    var row = target.closest(".settings-field-row");
    var avInput = row ? row.querySelector("input[name='avatar_url']") : null;
    var newAvatarUrl = avInput ? avInput.value.trim() : "";
    ctx.apiPut("/profile", { avatar_url: newAvatarUrl }).then(function () {
      ctx.notify("Avatar URL updated successfully.");
      if (ctx.state.profile) ctx.state.profile.avatar_url = newAvatarUrl;
      ctx.render();
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to update avatar.");
    });
    return true;
  }
  if (action === "updateBio") {
    var panel = target.closest(".profile-settings-panel");
    var txtArea = panel ? panel.querySelector("textarea[name='bio']") : null;
    var newBio = txtArea ? txtArea.value.trim() : "";
    ctx.apiPut("/profile", { bio: newBio }).then(function () {
      ctx.notify("Bio updated successfully.");
      if (ctx.state.profile) ctx.state.profile.bio = newBio;
      ctx.render();
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to update bio.");
    });
    return true;
  }
  if (action === "updatePreferences") {
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

    if (sizeVal < 16 || sizeVal > 26) {
      ctx.notify("Font size must be between 16 and 26px.");
      return true;
    }

    var prefs = {
      reader_theme: themeVal,
      reader_size: sizeVal,
      reader_mode: modeVal,
      email_notifications: emailVal,
      in_app_notifications: inAppVal
    };

    ctx.apiPut("/profile", { preferences: prefs }).then(function () {
      ctx.notify("Preferences updated successfully.");
      if (ctx.state.profile) ctx.state.profile.preferences = prefs;
      ctx.ui.readerTheme = themeVal;
      ctx.ui.readerSize = sizeVal;
      ctx.ui.readerMode = modeVal;
      ctx.render();
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to update preferences.");
    });
    return true;
  }
  if (action === "deleteAccount") {
    if (!window.confirm("ARE YOU SURE you want to delete your account? This will permanently delete your profile, stories, comments, and all related data. This action is irreversible!")) return true;
    ctx.apiDelete("/profile").then(function () {
      ctx.notify("Account deleted successfully.");
      ctx.handleSignOut();
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to delete account.");
    });
    return true;
  }
  return false;
}

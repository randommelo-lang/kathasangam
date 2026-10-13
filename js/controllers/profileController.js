import { openMfaSetup, openMfaDisable, openEmailOtpSetup, openEmailOtpDisable } from "../auth/securitySettings.js";
import { setFormFeedback, setButtonLoading } from "../components.js";

export function handleProfileClick(ctx, action, target, e) {
  if (action === "profileTab") {
    ctx.ui.currentView = target.dataset.value;
    window.location.hash = target.dataset.value;
    ctx.render();
    return true;
  }
  if (action === "goToSettings") {
    ctx.ui.currentView = "settings";
    window.location.hash = "settings";
    ctx.render();
    return true;
  }
  if (action === "profileSubTab") {
    ctx.ui.profileSubTab = target.dataset.value || "stories";
    ctx.render();
    return true;
  }
  if (action === "shareProfile") {
    var username = target.dataset.username || (ctx.state.profile && ctx.state.profile.username) || "";
    var profileUrl = window.location.origin + window.location.pathname + "#profile?username=" + encodeURIComponent(username);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(profileUrl).then(function () {
        ctx.notify("Profile link copied to clipboard!");
      }).catch(function () {
        ctx.notify("Profile link: " + profileUrl);
      });
    } else {
      ctx.notify("Profile link: " + profileUrl);
    }
    return true;
  }
  if (action === "followUser") {
    var userId = target.dataset.id;
    var targetUsername = target.dataset.username;
    if (!ctx.state.user) {
      if (ctx.openAuthModal) ctx.openAuthModal();
      return true;
    }
    var cached = ctx.state.publicProfiles && ctx.state.publicProfiles[targetUsername];
    if (!cached) {
      cached = { id: userId, username: targetUsername, is_following: false, followers_count: 0 };
      if (!ctx.state.publicProfiles) ctx.state.publicProfiles = {};
      ctx.state.publicProfiles[targetUsername] = cached;
    }

    var prevFollowing = !!cached.is_following;
    var prevCount = cached.followers_count || 0;

    // Optimistic UI update
    var nextFollowing = !prevFollowing;
    cached.is_following = nextFollowing;
    cached.followers_count = Math.max(0, prevCount + (nextFollowing ? 1 : -1));
    ctx.render();

    ctx.apiPost("/follow/user/" + userId)
      .then(function (res) {
        cached.is_following = res.followed;
        if (res.followed) {
          ctx.notify("Followed @" + targetUsername);
        } else {
          ctx.notify("Unfollowed @" + targetUsername);
        }
        ctx.render();
      })
      .catch(function (err) {
        console.error("Follow error:", err);
        // Rollback state cleanly
        cached.is_following = prevFollowing;
        cached.followers_count = prevCount;
        ctx.render();
        ctx.notify("Failed to update follow state. Action reverted.");
      });
    return true;
  }
  if (action === "blockUser") {
    var blockId = target.dataset.id;
    var blockUsername = target.dataset.username;
    if (!ctx.state.user) {
      if (ctx.openAuthModal) ctx.openAuthModal();
      return true;
    }
    window.showConfirm({
      title: "Block @" + blockUsername + "?",
      message: "They will no longer be able to follow your profile, view your private activity, or interact with your stories. You can unblock them at any time in Settings.",
      confirmText: "Block User",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      setButtonLoading(target, true, "Blocking...");
      var existingPrefs = (ctx.state.profile && ctx.state.profile.preferences) || {};
      var blocked = (existingPrefs.blocked_users || []).slice();
      if (!blocked.some(function (u) { return u.id === blockId || u.username === blockUsername; })) {
        blocked.push({ id: blockId, username: blockUsername });
      }
      var prefs = Object.assign({}, existingPrefs, { blocked_users: blocked });
      ctx.apiPut("/profile", { preferences: prefs })
        .then(function () {
          setButtonLoading(target, false);
          if (ctx.state.profile) ctx.state.profile.preferences = prefs;
          ctx.notify("Blocked @" + blockUsername);
          ctx.render();
        })
        .catch(function (err) {
          setButtonLoading(target, false);
          console.error("Block error:", err);
          ctx.notify(err.message || "Failed to block user.");
        });
    });
    return true;
  }
  if (action === "unblockUser") {
    var unblockId = target.dataset.id;
    var unblockUsername = target.dataset.username;
    setButtonLoading(target, true, "Unblocking...");
    var existingPrefs = (ctx.state.profile && ctx.state.profile.preferences) || {};
    var blocked = (existingPrefs.blocked_users || []).filter(function (u) {
      return u.id !== unblockId && u.username !== unblockUsername;
    });
    var prefs = Object.assign({}, existingPrefs, { blocked_users: blocked });
    ctx.apiPut("/profile", { preferences: prefs })
      .then(function () {
        setButtonLoading(target, false);
        if (ctx.state.profile) ctx.state.profile.preferences = prefs;
        ctx.notify("Unblocked @" + unblockUsername);
        ctx.render();
      })
      .catch(function (err) {
        setButtonLoading(target, false);
        console.error("Unblock error:", err);
        ctx.notify(err.message || "Failed to unblock user.");
      });
    return true;
  }
  if (action === "reportUser") {
    var reportId = target.dataset.id;
    var reportUsername = target.dataset.username;
    if (ctx.openReportModal) {
      ctx.openReportModal(ctx, "user", reportId, reportUsername);
    }
    return true;
  }
  if (action === "updateNotificationPreferences") {
    var group = target.closest(".settings-group");
    var panel = target.closest(".profile-settings-panel");
    if (!panel) return true;

    var emailNewChapters = panel.querySelector("input[name='email_new_chapters']");
    var emailComments = panel.querySelector("input[name='email_comments']");
    var emailInvites = panel.querySelector("input[name='email_invites']");
    var inAppStoryUpdates = panel.querySelector("input[name='in_app_story_updates']");
    var inAppInteractions = panel.querySelector("input[name='in_app_interactions']");
    var inAppSystem = panel.querySelector("input[name='in_app_system']");

    var notifPrefs = {
      email_new_chapters: emailNewChapters ? emailNewChapters.checked : true,
      email_comments: emailComments ? emailComments.checked : true,
      email_invites: emailInvites ? emailInvites.checked : true,
      in_app_story_updates: inAppStoryUpdates ? inAppStoryUpdates.checked : true,
      in_app_interactions: inAppInteractions ? inAppInteractions.checked : true,
      in_app_system: inAppSystem ? inAppSystem.checked : true
    };

    var existingPrefs = (ctx.state.profile && ctx.state.profile.preferences) || {};
    var prefs = Object.assign({}, existingPrefs, {
      notifications: notifPrefs,
      email_notifications: notifPrefs.email_new_chapters,
      in_app_notifications: notifPrefs.in_app_story_updates
    });

    setButtonLoading(target, true, "Saving...");
    setFormFeedback(group, "", "");
    ctx.apiPut("/profile", { preferences: prefs })
      .then(function () {
        setButtonLoading(target, false);
        if (ctx.state.profile) ctx.state.profile.preferences = prefs;
        setFormFeedback(group, "Notification preferences updated successfully!", "success");
        ctx.notify("Notification preferences saved.");
      })
      .catch(function (err) {
        setButtonLoading(target, false);
        console.error("Notification prefs error:", err);
        setFormFeedback(group, (err.message || "Failed to update notification preferences.") + " Please try again.", "error");
      });
    return true;
  }
  if (action === "openMfaSetup") {
    openMfaSetup({ notify: ctx.notify });
    return true;
  }
  if (action === "openMfaDisable") {
    openMfaDisable({ notify: ctx.notify });
    return true;
  }
  if (action === "openEmailOtpSetup") {
    openEmailOtpSetup({ notify: ctx.notify });
    return true;
  }
  if (action === "openEmailOtpDisable") {
    openEmailOtpDisable({ notify: ctx.notify });
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
 
    var dobInput = panel ? panel.querySelector("input[name='date_of_birth']") : null;
    var nsfwSelect = panel ? panel.querySelector("select[name='nsfw_preference']") : null;

    var themeVal = themeSelect ? themeSelect.value : "light";
    var modeVal = modeSelect ? modeSelect.value : "scroll";
    var sizeVal = sizeInput ? Number(sizeInput.value) : 19;
    var dobVal = dobInput ? dobInput.value : "";
    var nsfwVal = nsfwSelect ? nsfwSelect.value : "blur";

    setFormFeedback(group, "", "");

    if (sizeVal < 16 || sizeVal > 26) {
      setFormFeedback(group, "Font size must be between 16 and 26px. Please check your input and try again.", "error");
      return true;
    }

    var existingPrefs = (ctx.state.profile && ctx.state.profile.preferences) || {};
    var prefs = Object.assign({}, existingPrefs, {
      reader_theme: themeVal,
      reader_size: sizeVal,
      reader_mode: modeVal,
      date_of_birth: dobVal,
      nsfw_preference: nsfwVal
    });

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
  if (action === "exportUserData") {
    setButtonLoading(target, true, "Exporting...");
    ctx.api("/profile/export")
      .then(function (data) {
        setButtonLoading(target, false);
        var jsonStr = JSON.stringify(data, null, 2);
        var blob = new Blob([jsonStr], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        var dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = "kathasangam-user-data-" + dateStr + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ctx.notify("Your personal data has been exported successfully.");
      })
      .catch(function (err) {
        setButtonLoading(target, false);
        console.error(err);
        ctx.notify(err.message || "Failed to export user data.");
      });
    return true;
  }
  if (action === "clearReadingHistory") {
    window.showConfirm({
      title: "Clear Reading History",
      message: "Are you sure you want to clear your reading history and chapter progress? This cannot be undone.",
      confirmText: "Clear History",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      setButtonLoading(target, true, "Clearing...");
      ctx.api("/progress", { method: "DELETE" })
        .then(function () {
          setButtonLoading(target, false);
          if (ctx.state) ctx.state.readingProgress = {};
          ctx.notify("Reading history cleared successfully.");
        })
        .catch(function (err) {
          setButtonLoading(target, false);
          console.error(err);
          ctx.notify(err.message || "Failed to clear reading history.");
        });
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

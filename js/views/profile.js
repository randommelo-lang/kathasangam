import { state, ui } from "../state.js?v=profile-redirect-20260619-v30";
import { api, apiPost, apiPut } from "../api.js?v=profile-redirect-20260619-v30";
import { el, button, input, textarea, select, formatNumber } from "../components.js?v=profile-redirect-20260619-v30";
import { storyCard } from "./shared.js?v=profile-redirect-20260619-v30";

let ctx = null;

function storyForm() {
  return el("form", { "data-form": "storyForm", class: "form-grid" }, [
    el("div", "field", [
      el("span", null, "Title"),
      input("text", "", { name: "title", placeholder: "New series title", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "Type"),
      select("type", [["Web Novel", "Web Novel"], ["Chitrānk", "Chitrānk"]])
    ]),
    el("div", "field", [
      el("span", null, "Genre (comma separated)"),
      input("text", "", { name: "genre", placeholder: "e.g. Fantasy, Romance", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "Synopsis"),
      textarea("description", "A new serialized story begins here.")
    ]),
    el("button", { type: "submit", class: "btn primary orange-glow-btn auth-submit-btn" }, "Create")
  ]);
}

function storySettingsForm(story) {
  return el("form", { "data-form": "storySettingsForm", class: "form-grid" }, [
    (function () {
      var hidden = el("input");
      hidden.type = "hidden";
      hidden.name = "id";
      hidden.value = story.id;
      return hidden;
    })(),
    el("div", "field", [
      el("span", null, "Title"),
      input("text", story.title, { name: "title", placeholder: "Series title", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "Genre (comma separated)"),
      input("text", story.genre, { name: "genre", placeholder: "e.g. Fantasy, Romance", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "Language"),
      input("text", story.language || "English", { name: "language", placeholder: "English", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "License"),
      select("license", [
        ["Creator-owned", "Creator-owned"],
        ["Creative Commons BY", "Creative Commons BY"],
        ["Creative Commons BY-NC", "Creative Commons BY-NC"],
        ["Public Domain", "Public Domain"]
      ], story.license || "Creator-owned")
    ]),
    el("div", "field", [
      el("span", null, "Status"),
      select("status", [
        ["draft", "Draft / Unpublished"],
        ["ongoing", "Ongoing / Active"],
        ["completed", "Completed"],
        ["on_hold", "On Hold"],
        ["cancelled", "Cancelled"]
      ], story.status || "draft")
    ]),
    el("div", "field", [
      el("span", null, "Synopsis"),
      textarea("description", story.description || "")
    ]),
    el("button", { type: "submit", class: "btn primary orange-glow-btn auth-submit-btn" }, "Save Changes")
  ]);
}

export { storyForm, storySettingsForm };

export function renderProfileSettings(context) {
  ctx = context || this || ctx;
  var view = ctx.view;

  var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  var targetUsername = params.get("username");

  if (targetUsername) {
    state.publicProfiles = state.publicProfiles || {};
    var cached = state.publicProfiles[targetUsername];
    if (!cached) {
      var loadingEl = el("div", "empty", "Loading profile...");
      view.appendChild(loadingEl);
      api("/profiles/" + encodeURIComponent(targetUsername))
        .then(function (profile) {
          state.publicProfiles[targetUsername] = profile;
          ctx.render();
        })
        .catch(function (err) {
          console.error("Error loading public profile:", err);
          loadingEl.textContent = "Profile not found or failed to load.";
        });
      return;
    }

    var username = cached.username;
    var role = (cached.role || "reader").toLowerCase();
    var avatarUrl = cached.avatar_url || "";
    var bio = cached.bio || "";
    var initial = username.charAt(0).toUpperCase();

    var avatarEl = el("div", "profile-avatar-lg");
    if (avatarUrl) {
      avatarEl.style.backgroundImage = "url('" + avatarUrl + "')";
    } else {
      avatarEl.textContent = initial;
    }

    var followBtn = null;
    var messageBtn = null;

    if (state.user && cached.id !== state.user.id) {
      var isFollowingUser = cached.is_following;
      followBtn = el("button", {
        class: "btn" + (isFollowingUser ? " active" : " primary"),
        style: "display: flex; align-items: center; gap: 6px;"
      }, isFollowingUser ? "Following" : "Follow");

      followBtn.addEventListener("click", function () {
        apiPost("/follow/user/" + cached.id)
          .then(function (res) {
            cached.is_following = res.followed;
            if (res.followed) {
              cached.followers_count = (cached.followers_count || 0) + 1;
              ctx.notify("Followed " + username);
            } else {
              cached.followers_count = Math.max(0, (cached.followers_count || 0) - 1);
              ctx.notify("Unfollowed " + username);
            }
            ctx.render();
          })
          .catch(function (err) {
            console.error("Follow failed:", err);
            ctx.notify("Error following user: " + (err.message || err));
          });
      });

      messageBtn = el("button", {
        class: "btn secondary",
        style: "display: flex; align-items: center; gap: 6px;"
      }, [
        el("span", "icon icon-pencil"),
        "Message"
      ]);
      messageBtn.addEventListener("click", function () {
        ui.activeConversationUserId = cached.id;
        ui.activeConversationUser = cached;
        window.location.hash = "messages";
      });
    }

    var headerCardChildren = [
      avatarEl,
      el("div", "profile-header-info", [
        el("h2", "profile-display-name", username),
        el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1)),
        el("div", { class: "profile-header-social-stats", style: "margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);" }, [
          el("span", null, formatNumber(cached.followers_count || 0) + " Followers"),
          " · ",
          el("span", null, formatNumber(cached.following_count || 0) + " Following")
        ])
      ])
    ];

    if (followBtn || messageBtn) {
      var actionsContainer = el("div", {
        style: "margin-left: auto; display: flex; gap: 8px; align-items: center;"
      });
      if (followBtn) actionsContainer.appendChild(followBtn);
      if (messageBtn) actionsContainer.appendChild(messageBtn);
      headerCardChildren.push(actionsContainer);
    }

    var headerCard = el("section", "profile-header-card", headerCardChildren);
    view.appendChild(headerCard);

    var bioBlock = el("section", "profile-bio-card", [
      el("h3", "profile-section-title", "About " + username),
      el("p", "profile-bio-text", bio || "This user hasn't written a bio yet.")
    ]);
    view.appendChild(bioBlock);

    var authorStories = state.stories.filter(function (s) {
      return s.author === username;
    });

    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [el("strong", null, String(authorStories.length)), el("span", null, "Stories")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")])
    ]);
    view.appendChild(statsRow);

    if (authorStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Stories by " + username));
      var grid = el("section", "story-grid");
      authorStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: false }));
      });
      view.appendChild(grid);
    }
    return;
  }

  if (!state.user || !state.profile) {
    view.appendChild(el("div", "empty", "Please log in to view your profile."));
    return;
  }

  var username = state.profile.username || state.user.email.split("@")[0];
  var email = state.user.email || "";
  var role = (state.profile.role || "reader").toLowerCase();
  var avatarUrl = state.profile.avatar_url || "";
  var initial = username.charAt(0).toUpperCase();
  var isSettings = ui.currentView === "settings";

  var avatarEl = el("div", "profile-avatar-lg");
  if (avatarUrl) {
    avatarEl.style.backgroundImage = "url('" + avatarUrl + "')";
  } else {
    avatarEl.textContent = initial;
  }

  var headerCard = el("section", "profile-header-card", [
    avatarEl,
    el("div", "profile-header-info", [
      el("h2", "profile-display-name", username),
      el("p", "profile-email", email),
      el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1)),
      el("div", { class: "profile-header-social-stats", style: "margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);" }, [
        el("span", null, formatNumber(state.profile.followers_count || 0) + " Followers"),
        " · ",
        el("span", null, formatNumber(state.profile.following_count || 0) + " Following")
      ])
    ])
  ]);
  view.appendChild(headerCard);

  var tabs = el("div", "profile-tabs", [
    button("Profile", isSettings ? "profile-tab" : "profile-tab active", { action: "profileTab", value: "profile" }),
    button("Settings", isSettings ? "profile-tab active" : "profile-tab", { action: "profileTab", value: "settings" })
  ]);
  view.appendChild(tabs);

  if (!isSettings) {
    var userStories = state.stories.filter(function (s) {
      return state.user && s.author_id === state.user.id;
    });

    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [el("strong", null, String(userStories.length)), el("span", null, "Stories")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(userStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")])
    ]);
    view.appendChild(statsRow);

    if (userStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Your Stories"));
      var grid = el("section", "story-grid");
      userStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: true }));
      });
      view.appendChild(grid);
    }
  } else {
    var defaultTheme = (state.profile && state.profile.preferences && state.profile.preferences.reader_theme) || "light";
    var defaultMode = (state.profile && state.profile.preferences && state.profile.preferences.reader_mode) || "scroll";
    var defaultSize = (state.profile && state.profile.preferences && state.profile.preferences.reader_size) || 19;
    var defaultEmail = (state.profile && state.profile.preferences && state.profile.preferences.email_notifications !== undefined) ? state.profile.preferences.email_notifications : true;
    var defaultInApp = (state.profile && state.profile.preferences && state.profile.preferences.in_app_notifications !== undefined) ? state.profile.preferences.in_app_notifications : true;

    var uInput = input("text", username, { name: "username", placeholder: "Your username" });
    var uHint = el("p", "username-hint", "");
    uInput.addEventListener("input", function (e) {
      var val = e.target.value.trim();
      if (!val) {
        uHint.textContent = "";
        uHint.className = "username-hint";
        return;
      }
      if (val === (state.profile ? state.profile.username : "")) {
        uHint.textContent = "Your current username";
        uHint.className = "username-hint available";
        return;
      }
      uHint.textContent = "Checking...";
      uHint.className = "username-hint checking";
      
      clearTimeout(uInput.timer);
      uInput.timer = setTimeout(function () {
        api("/profiles/check-username/" + encodeURIComponent(val))
          .then(function (res) {
            if (e.target.value.trim() !== val) return;
            if (res.available) {
              uHint.textContent = "Username is available";
              uHint.className = "username-hint available";
            } else {
              uHint.textContent = "Username is already taken";
              uHint.className = "username-hint taken";
            }
          })
          .catch(function () {
            if (e.target.value.trim() !== val) return;
            uHint.textContent = "Error checking username";
            uHint.className = "username-hint taken";
          });
      }, 500);
    });

    var bioTextarea = textarea("bio", state.profile.bio || "");
    bioTextarea.className = "settings-bio-textarea";
    bioTextarea.placeholder = "Write a short bio about yourself...";

    var settingsPanel = el("section", "profile-settings-panel", [
      el("h3", "profile-section-title", "Account Settings"),

      el("div", "settings-group", [
        el("label", "settings-label", "Username"),
        el("div", "settings-field-row", [
          uInput,
          button("Update", "btn primary btn-sm", { action: "updateUsername" })
        ]),
        uHint
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Email"),
        el("div", "settings-field-row", [
          input("text", email, { name: "email", disabled: "true", placeholder: "Email address" })
        ]),
        el("p", "settings-hint", "Email changes are managed through your authentication provider.")
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Avatar URL"),
        el("div", "settings-field-row", [
          input("text", avatarUrl, { name: "avatar_url", placeholder: "https://example.com/avatar.jpg" }),
          button("Update", "btn primary btn-sm", { action: "updateAvatar" })
        ]),
        el("p", "settings-hint", "Paste a URL to an image to use as your avatar.")
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Bio"),
        el("div", "settings-field-row", [
          bioTextarea
        ]),
        el("div", "settings-field-row", [
          button("Update Bio", "btn primary btn-sm", { action: "updateBio" })
        ]),
        el("p", "settings-hint", "Tell other readers and authors about yourself.")
      ]),

      el("div", "settings-group", [
        el("h4", { style: "display: flex; align-items: center; gap: 8px; margin-bottom: 16px;" }, [
          el("span", "icon icon-bell"),
          document.createTextNode("Reading & Notifications")
        ]),
        el("div", "settings-field-row-wrap", [
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Theme"),
            select("reader_theme", [["light", "Light"], ["dark", "Dark"]], defaultTheme)
          ]),
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Reading Mode"),
            select("reader_mode", [["scroll", "Scroll"], ["pages", "Pages / Page Flip"]], defaultMode)
          ]),
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Font Size (px)"),
            input("number", defaultSize, { name: "reader_size", min: "16", max: "26" })
          ])
        ]),
        el("div", "settings-checkboxes", [
          el("label", "checkbox-label", [
            input("checkbox", null, Object.assign({ name: "email_notifications" }, defaultEmail ? { checked: "checked" } : {})),
            document.createTextNode(" Receive email notifications for new chapters")
          ]),
          el("label", "checkbox-label", [
            input("checkbox", null, Object.assign({ name: "in_app_notifications" }, defaultInApp ? { checked: "checked" } : {})),
            document.createTextNode(" Receive in-app notifications")
          ])
        ]),
        el("div", "settings-field-row", [
          button("Update Preferences", "btn primary btn-sm", { action: "updatePreferences" })
        ])
      ]),

      el("div", "settings-group settings-danger-zone", [
        el("h4", null, "Danger Zone"),
        el("p", "settings-hint", "Once you delete your account, there is no going back."),
        button("Delete Account", "btn danger", { action: "deleteAccount" })
      ])
    ]);
    view.appendChild(settingsPanel);
  }
}

import { state, ui } from "../state.js";
import { api, apiPost, apiPut, getSupabaseClient } from "../api.js";
import { el, button, input, textarea, select, formatNumber, svgEl } from "../components.js";
import { storyCard, emptyState } from "./shared.js";

let ctx = null;

function makeBookIcon() {
  return svgEl("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "stat-icon"
  }, [
    svgEl("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
    svgEl("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" })
  ]);
}

function makeEyeIcon() {
  return svgEl("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "stat-icon"
  }, [
    svgEl("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
    svgEl("circle", { cx: "12", cy: "12", r: "3" })
  ]);
}

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
      el("span", null, "Language"),
      input("text", "English", { name: "language", placeholder: "e.g. English, Hindi", required: "true" })
    ]),
    el("div", "field", [
      el("span", null, "NSFW / Mature Content (18+)"),
      select("isNsfw", [["false", "No - General Audiences"], ["true", "Yes - 18+ Mature Content"]])
    ]),
    el("div", "field", [
      el("span", null, "Synopsis"),
      textarea("description", "A new serialized story begins here.")
    ]),
    el("button", { type: "submit", class: "btn primary orange-glow-btn auth-submit-btn" }, "Create")
  ]);
}

function storySettingsForm(story) {
  var isNsfwStr = story.isNsfw ? "true" : "false";
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
      el("span", null, "NSFW / Mature Content (18+)"),
      select("isNsfw", [["false", "No - General Audiences"], ["true", "Yes - 18+ Mature Content"]], isNsfwStr)
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
      el("div", "profile-stat", [
        makeBookIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, String(authorStories.length)),
          el("span", null, "Stories")
        ])
      ]),
      el("div", "profile-stat", [
        makeEyeIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))),
          el("span", null, "Total Reads")
        ])
      ])
    ]);
    view.appendChild(statsRow);

    view.appendChild(el("div", "profile-section-header", [
      el("h3", "profile-section-title", "Stories by " + username),
      el("span", "story-count-pill", String(authorStories.length))
    ]));
    if (authorStories.length) {
      var grid = el("section", "story-grid");
      authorStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: false }));
      });
      view.appendChild(grid);
    } else {
      var isMe = state.user && cached.id === state.user.id;
      view.appendChild(
        emptyState(
          isMe ? "You haven't published any stories yet" : "No stories published yet",
          isMe ? "Start sharing your serialized novels or comics with the community." : "Check back later or browse other stories in the discovery feed.",
          el("button", {
            class: "btn primary",
            onclick: function() {
              if (isMe) {
                window.location.hash = "studio";
              } else {
                window.location.hash = "discover";
              }
            }
          }, isMe ? "Go to Author Studio" : "Browse Stories"),
          "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        )
      );
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
      el("div", "profile-stat", [
        makeBookIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, String(userStories.length)),
          el("span", null, "Stories")
        ])
      ]),
      el("div", "profile-stat", [
        makeEyeIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, formatNumber(userStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))),
          el("span", null, "Total Reads")
        ])
      ])
    ]);
    view.appendChild(statsRow);

    if (userStories.length) {
      view.appendChild(el("div", "profile-section-header", [
        el("h3", "profile-section-title", "Your Stories"),
        el("span", "story-count-pill", String(userStories.length))
      ]));
      var grid = el("section", "story-grid");
      userStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: true }));
      });
      view.appendChild(grid);
    }
  } else {
    if (state.mfaFactors === undefined) {
      state.mfaFactors = [];
    }

    var defaultTheme = (state.profile && state.profile.preferences && state.profile.preferences.reader_theme) || "light";
    var defaultMode = (state.profile && state.profile.preferences && state.profile.preferences.reader_mode) || "scroll";
    var defaultSize = (state.profile && state.profile.preferences && state.profile.preferences.reader_size) || 19;
    var defaultEmail = (state.profile && state.profile.preferences && state.profile.preferences.email_notifications !== undefined) ? state.profile.preferences.email_notifications : true;
    var defaultInApp = (state.profile && state.profile.preferences && state.profile.preferences.in_app_notifications !== undefined) ? state.profile.preferences.in_app_notifications : true;
    var dobVal = (state.profile && state.profile.preferences && state.profile.preferences.date_of_birth) || "";
    var defaultNsfwPreference = (state.profile && state.profile.preferences && state.profile.preferences.nsfw_preference) || "blur";

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

    function getAge(dateString) {
      if (!dateString) return 0;
      var today = new Date();
      var birthDate = new Date(dateString);
      var age = today.getFullYear() - birthDate.getFullYear();
      var m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }

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

      (function () {
        var avatarPreview = el("div", "settings-avatar-preview");
        if (avatarUrl) {
          avatarPreview.style.backgroundImage = "url('" + avatarUrl + "')";
        } else {
          avatarPreview.textContent = initial;
        }

        var avatarFeedback = el("p", "form-feedback", "");
        avatarFeedback.style.display = "none";

        var fileInput = el("input");
        fileInput.type = "file";
        fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
        fileInput.style.display = "none";

        var uploadBtn = button("Upload Photo", "btn primary btn-sm", {});
        uploadBtn.type = "button";
        uploadBtn.addEventListener("click", function () { fileInput.click(); });

        var removeBtn = button("Remove Photo", "btn secondary btn-sm", {});
        removeBtn.type = "button";
        removeBtn.style.display = avatarUrl ? "" : "none";

        fileInput.addEventListener("change", function (evt) {
          var file = evt.target.files[0];
          if (!file) return;

          // Client-side validation
          var allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
          if (!allowedTypes.includes(file.type)) {
            avatarFeedback.textContent = "Please select a PNG, JPEG, WebP, or GIF image.";
            avatarFeedback.className = "form-feedback error";
            avatarFeedback.style.display = "";
            fileInput.value = "";
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            avatarFeedback.textContent = "Image is too large. Maximum size is 5 MB.";
            avatarFeedback.className = "form-feedback error";
            avatarFeedback.style.display = "";
            fileInput.value = "";
            return;
          }

          // Show loading state
          avatarPreview.classList.add("loading");
          avatarFeedback.textContent = "Uploading...";
          avatarFeedback.className = "form-feedback info";
          avatarFeedback.style.display = "";
          uploadBtn.disabled = true;
          removeBtn.disabled = true;

          var fd = new FormData();
          fd.append("file", file);

          api("/upload/image", { method: "POST", body: fd })
            .then(function (resp) {
              if (!resp || !resp.url) throw new Error("Upload failed");
              return apiPut("/profile", { avatar_url: resp.url }).then(function () {
                return resp.url;
              });
            })
            .then(function (newUrl) {
              avatarPreview.classList.remove("loading");
              avatarPreview.textContent = "";
              avatarPreview.style.backgroundImage = "url('" + newUrl + "')";
              if (ctx.state && ctx.state.profile) ctx.state.profile.avatar_url = newUrl;
              avatarFeedback.textContent = "Avatar updated successfully!";
              avatarFeedback.className = "form-feedback success";
              removeBtn.style.display = "";
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              fileInput.value = "";
            })
            .catch(function (err) {
              avatarPreview.classList.remove("loading");
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              fileInput.value = "";
              console.error(err);
              if (err.status === 413) {
                avatarFeedback.textContent = "Upload failed: File is too large (max 5 MB).";
              } else if (err.status === 415) {
                avatarFeedback.textContent = "Upload failed: Invalid format. Only PNG, JPG, WEBP, and GIF allowed.";
              } else {
                avatarFeedback.textContent = (err.message || "Failed to upload avatar.") + " Please try again.";
              }
              avatarFeedback.className = "form-feedback error";
            });
        });

        removeBtn.addEventListener("click", function () {
          avatarPreview.classList.add("loading");
          avatarFeedback.textContent = "Removing...";
          avatarFeedback.className = "form-feedback info";
          avatarFeedback.style.display = "";
          uploadBtn.disabled = true;
          removeBtn.disabled = true;

          apiPut("/profile", { avatar_url: "" })
            .then(function () {
              avatarPreview.classList.remove("loading");
              avatarPreview.style.backgroundImage = "";
              avatarPreview.textContent = initial;
              if (ctx.state && ctx.state.profile) ctx.state.profile.avatar_url = "";
              avatarFeedback.textContent = "Avatar removed.";
              avatarFeedback.className = "form-feedback success";
              removeBtn.style.display = "none";
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
            })
            .catch(function (err) {
              avatarPreview.classList.remove("loading");
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              console.error(err);
              avatarFeedback.textContent = (err.message || "Failed to remove avatar.") + " Please try again.";
              avatarFeedback.className = "form-feedback error";
            });
        });

        return el("div", "settings-group", [
          el("label", "settings-label", "Profile Photo"),
          el("div", "settings-avatar-wrapper", [
            avatarPreview,
            el("div", "settings-avatar-actions", [
              uploadBtn,
              removeBtn,
              fileInput
            ])
          ]),
          avatarFeedback,
          el("p", "settings-hint", "Upload a PNG, JPEG, WebP, or GIF image (max 5 MB).")
        ]);
      })(),

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
          document.createTextNode("Reading & Content Preferences")
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
        el("div", "settings-field-row-wrap", [
          el("div", "settings-field-col", [
            el("label", "settings-label", "Date of Birth"),
            input("date", dobVal, { name: "date_of_birth" })
          ]),
          (function() {
            var age = getAge(dobVal);
            if (age >= 18) {
              return el("div", "settings-field-col", [
                el("label", "settings-label", "NSFW Content (18+)"),
                select("nsfw_preference", [
                  ["blur", "Blur 18+ content (Default)"],
                  ["show", "Show 18+ content"],
                  ["hide", "Hide 18+ content"]
                ], defaultNsfwPreference)
              ]);
            } else {
              return el("div", "settings-field-col", [
                el("label", "settings-label", "NSFW Content (18+)"),
                el("div", { style: "color: var(--muted); font-size: 0.85rem; padding-top: 8px;" }, "Hidden (under 18)")
              ]);
            }
          })()
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

      el("div", "settings-group", [
        el("h4", { style: "display: flex; align-items: center; gap: 8px; margin-bottom: 16px;" }, [
          el("span", { class: "icon icon-lock", style: "font-family: inherit;" }),
          document.createTextNode("Two-Factor Authentication (2FA)")
        ]),
        el("div", { style: "display: flex; flex-direction: column; gap: 20px;" }, [
          // Email verification code
          (function () {
            var emailEnabled = (state.profile && state.profile.preferences && state.profile.preferences.two_factor_email_enabled) || false;

            return el("div", { style: "padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: rgba(0,0,0,0.015);" }, [
              el("h5", { style: "margin: 0 0 8px 0; font-size: 0.92rem; font-weight: 600;" }, "Email Verification Code (OTP)"),
              el("p", { style: "margin: 0 0 8px 0; font-size: 0.85rem; font-weight: 500;" }, 
                emailEnabled 
                  ? "Status: 🟢 Enabled" 
                  : "Status: 🔴 Disabled"
              ),
              el("p", "settings-hint", "Receive a 6-digit one-time code on your registered email address when logging in."),
              el("div", { style: "margin-top: 12px;" }, [
                emailEnabled
                  ? button("Disable Email 2FA", "btn danger btn-sm", { action: "openEmailOtpDisable" })
                  : button("Enable Email 2FA", "btn primary btn-sm", { action: "openEmailOtpSetup" })
              ])
            ]);
          })()
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

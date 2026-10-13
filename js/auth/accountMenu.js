import { state } from "../state.js";
import { el } from "../components.js";
import { getAuthElements, openAuthModal } from "./authModal.js";
import { changeUserRole, getAuthEffects } from "./session.js";

export function accountMenuButton(label, viewName) {
  var btn = document.createElement("button");
  btn.className = "account-menu-item";
  btn.type = "button";
  btn.dataset.action = "accountNav";
  btn.dataset.view = viewName;
  btn.textContent = label;
  return btn;
}

export function toggleAccountMenu() {
  const effects = /** @type {any} */ (getAuthEffects());
  if (effects.closeNotificationMenu) {
    effects.closeNotificationMenu();
  } else {
    var notifDropdown = /** @type {HTMLElement | null} */ (
      document.querySelector(".notification-dropdown")
    );
    if (notifDropdown) notifDropdown.hidden = true;
  }
  var menu = /** @type {HTMLElement | null} */ (document.querySelector(".account-dropdown"));
  var trigger = /** @type {HTMLElement | null} */ (document.querySelector(".account-trigger"));
  if (!menu) return;
  menu.hidden = !menu.hidden;
  if (trigger) trigger.setAttribute("aria-expanded", String(!menu.hidden));
  if (menu.hidden) {
    var rolePopup = /** @type {HTMLElement | null} */ (document.querySelector(".auth-role-popup"));
    var roleBtn = /** @type {HTMLElement | null} */ (
      document.querySelector(".auth-role-picker .auth-role-badge-select")
    );
    if (rolePopup) rolePopup.hidden = true;
    if (roleBtn) roleBtn.setAttribute("aria-expanded", "false");
  }
}

export function closeAccountMenu() {
  var menu = /** @type {HTMLElement | null} */ (document.querySelector(".account-dropdown"));
  var trigger = /** @type {HTMLElement | null} */ (document.querySelector(".account-trigger"));
  var rolePopup = /** @type {HTMLElement | null} */ (document.querySelector(".auth-role-popup"));
  var roleBtn = /** @type {HTMLElement | null} */ (
    document.querySelector(".auth-role-picker .auth-role-badge-select")
  );
  if (rolePopup) rolePopup.hidden = true;
  if (roleBtn) roleBtn.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

export function updateAuthUI() {
  const els = getAuthElements();
  if (!els.authArea) return;
  if (state.user && state.profile) {
    var username = state.profile.username || state.user.email.split("@")[0];
    var role = (state.profile.role || "reader").toLowerCase();
    var avatarUrl = state.profile.avatar_url || "";
    var initial = username.charAt(0).toUpperCase();
    var email = state.user.email || "";

    els.authArea.innerHTML = "";

    var menu = document.createElement("div");
    menu.className = "account-menu";

    var trigger = document.createElement("button");
    trigger.className = "account-trigger";
    trigger.type = "button";
    trigger.dataset.action = "accountToggle";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    var triggerAvatar = document.createElement("span");
    triggerAvatar.className = "auth-avatar";
    if (avatarUrl) {
      triggerAvatar.style.backgroundImage = "url('" + avatarUrl + "')";
      triggerAvatar.style.backgroundSize = "cover";
      triggerAvatar.style.backgroundPosition = "center";
      triggerAvatar.textContent = "";
    } else {
      triggerAvatar.textContent = initial;
    }

    var triggerName = document.createElement("span");
    triggerName.className = "auth-username";
    triggerName.textContent = username;

    var triggerChevron = document.createElement("span");
    triggerChevron.className = "account-chevron";
    triggerChevron.textContent = "▼";

    trigger.appendChild(triggerAvatar);
    trigger.appendChild(triggerName);
    trigger.appendChild(triggerChevron);

    var dropdown = document.createElement("div");
    dropdown.className = "account-dropdown";
    dropdown.hidden = true;

    var header = document.createElement("div");
    header.className = "account-dropdown-header";

    var headerAvatar = document.createElement("div");
    headerAvatar.className = "profile-avatar-sm";
    if (avatarUrl) {
      headerAvatar.style.backgroundImage = "url('" + avatarUrl + "')";
      headerAvatar.style.backgroundSize = "cover";
      headerAvatar.style.backgroundPosition = "center";
    } else {
      headerAvatar.textContent = initial;
    }

    var headerInfo = document.createElement("div");
    headerInfo.className = "account-dropdown-info";
    headerInfo.appendChild(el("strong", null, username));
    headerInfo.appendChild(el("span", null, email));

    header.appendChild(headerAvatar);
    header.appendChild(headerInfo);
    dropdown.appendChild(header);

    var badgeRow = el("div", "account-role-row");
    var badgeLabel = el("span", "account-role-label", "Role:");

    var rolePicker = el("div", "auth-role-picker");

    var badgeBtn = document.createElement("button");
    badgeBtn.type = "button";
    badgeBtn.className = "auth-role-badge-select";
    badgeBtn.dataset.role = role.toLowerCase();
    badgeBtn.title = "Click to change your role (Developer Switcher)";
    badgeBtn.setAttribute("aria-haspopup", "listbox");
    badgeBtn.setAttribute("aria-expanded", "false");
    badgeBtn.setAttribute("aria-label", "Change role: currently " + role);

    // SB-04/SB-11: this list is no longer gated on ADMIN_EMAIL / MODERATOR_EMAILS.
    // Those are server-side authorization inputs and are no longer published by
    // GET /api/config, so the client has no way to know them — and needs none.
    // PATCH /api/profile/role re-verifies the caller against the server's own
    // environment values and rejects anyone not entitled, so this list is purely
    // cosmetic.
    //
    // Visibility is derived from the role the server already reports for this user.
    // That is sufficient: `update_profile_role` permits an admin to return to admin,
    // and a moderator to return to moderator, so nothing reachable from this menu
    // becomes unreachable by hiding an option.
    var currentRole = String(role || "").toLowerCase();
    var roles = ["reader", "author"];
    if (currentRole === "moderator" || currentRole === "admin") {
      roles = roles.concat("moderator");
    }
    if (currentRole === "admin") {
      roles = roles.concat("admin");
    }

    var rolePopup = el("div", {
      class: "auth-role-popup",
      role: "listbox",
      "aria-label": "Select role"
    });
    rolePopup.hidden = true;

    roles.forEach(function (r) {
      var isCurrent = r === role.toLowerCase();
      var roleName = r.charAt(0).toUpperCase() + r.slice(1);
      var optChildren = [
        el("span", { class: "auth-role-option-icon", "data-role": r }),
        el("span", "auth-role-option-label", roleName)
      ];
      if (isCurrent) {
        optChildren.push(el("span", "auth-role-check", "✓"));
      }

      var optBtn = el(
        "button",
        {
          type: "button",
          class: "auth-role-option" + (isCurrent ? " active" : ""),
          role: "option",
          "aria-selected": String(isCurrent),
          "data-role": r
        },
        optChildren
      );

      optBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        rolePopup.hidden = true;
        badgeBtn.setAttribute("aria-expanded", "false");
        changeUserRole(r);
      });

      rolePopup.appendChild(optBtn);
    });

    badgeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = rolePopup.hidden;
      rolePopup.hidden = !willOpen;
      badgeBtn.setAttribute("aria-expanded", String(willOpen));
    });

    rolePicker.appendChild(badgeBtn);
    rolePicker.appendChild(rolePopup);

    badgeRow.appendChild(badgeLabel);
    badgeRow.appendChild(rolePicker);
    dropdown.appendChild(badgeRow);

    var divider = document.createElement("div");
    divider.className = "account-dropdown-divider";
    dropdown.appendChild(divider);

    dropdown.appendChild(accountMenuButton("Profile", "profile"));
    dropdown.appendChild(accountMenuButton("Settings", "settings"));
    dropdown.appendChild(accountMenuButton("Library", "library"));
    dropdown.appendChild(accountMenuButton("Author Studio", "studio"));
    dropdown.appendChild(accountMenuButton("Achievements", "achievements"));
    if (role === "admin" || role === "moderator") {
      dropdown.appendChild(accountMenuButton("Moderation Workspace", "moderation"));
    }

    var divider2 = document.createElement("div");
    divider2.className = "account-dropdown-divider";
    dropdown.appendChild(divider2);

    var signOutBtn = document.createElement("button");
    signOutBtn.className = "account-menu-item danger";
    signOutBtn.type = "button";
    signOutBtn.dataset.action = "accountSignOut";
    signOutBtn.textContent = "Sign Out";

    dropdown.appendChild(signOutBtn);

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    els.authArea.appendChild(menu);
  } else if (state.user) {
    var userEmailStr = state.user.email || "";
    var userInitial = userEmailStr.charAt(0).toUpperCase();
    var fallbackUsername = userEmailStr.split("@")[0];

    els.authArea.innerHTML = "";

    var fallbackMenu = document.createElement("div");
    fallbackMenu.className = "account-menu";

    var fallbackTrigger = document.createElement("button");
    fallbackTrigger.className = "account-trigger";
    fallbackTrigger.type = "button";
    fallbackTrigger.dataset.action = "accountToggle";
    fallbackTrigger.setAttribute("aria-haspopup", "true");
    fallbackTrigger.setAttribute("aria-expanded", "false");

    var fallbackTriggerAvatar = document.createElement("span");
    fallbackTriggerAvatar.className = "auth-avatar";
    fallbackTriggerAvatar.textContent = userInitial;

    var fallbackTriggerName = document.createElement("span");
    fallbackTriggerName.className = "auth-username";
    fallbackTriggerName.textContent = fallbackUsername;

    var fallbackTriggerChevron = document.createElement("span");
    fallbackTriggerChevron.className = "account-chevron";
    fallbackTriggerChevron.textContent = "▼";

    fallbackTrigger.appendChild(fallbackTriggerAvatar);
    fallbackTrigger.appendChild(fallbackTriggerName);
    fallbackTrigger.appendChild(fallbackTriggerChevron);

    var fallbackDropdown = document.createElement("div");
    fallbackDropdown.className = "account-dropdown";
    fallbackDropdown.hidden = true;

    var fallbackHeader = document.createElement("div");
    fallbackHeader.className = "account-dropdown-header";

    var fallbackHeaderAvatar = document.createElement("div");
    fallbackHeaderAvatar.className = "profile-avatar-sm";
    fallbackHeaderAvatar.textContent = userInitial;

    var fallbackHeaderInfo = document.createElement("div");
    fallbackHeaderInfo.className = "account-dropdown-info";
    fallbackHeaderInfo.appendChild(el("strong", null, fallbackUsername));
    fallbackHeaderInfo.appendChild(el("span", null, userEmailStr));

    fallbackHeader.appendChild(fallbackHeaderAvatar);
    fallbackHeader.appendChild(fallbackHeaderInfo);
    fallbackDropdown.appendChild(fallbackHeader);

    var fallbackDivider = document.createElement("div");
    fallbackDivider.className = "account-dropdown-divider";
    fallbackDropdown.appendChild(fallbackDivider);

    fallbackDropdown.appendChild(accountMenuButton("Profile", "profile"));
    fallbackDropdown.appendChild(accountMenuButton("Settings", "settings"));
    fallbackDropdown.appendChild(accountMenuButton("Library", "library"));
    fallbackDropdown.appendChild(accountMenuButton("Author Studio", "studio"));
    fallbackDropdown.appendChild(accountMenuButton("Achievements", "achievements"));

    var fallbackDivider2 = document.createElement("div");
    fallbackDivider2.className = "account-dropdown-divider";
    fallbackDropdown.appendChild(fallbackDivider2);

    var fallbackSignOutBtn = document.createElement("button");
    fallbackSignOutBtn.className = "account-menu-item danger";
    fallbackSignOutBtn.type = "button";
    fallbackSignOutBtn.dataset.action = "accountSignOut";
    fallbackSignOutBtn.textContent = "Sign Out";

    fallbackDropdown.appendChild(fallbackSignOutBtn);

    fallbackMenu.appendChild(fallbackTrigger);
    fallbackMenu.appendChild(fallbackDropdown);
    els.authArea.appendChild(fallbackMenu);
  } else {
    els.authArea.innerHTML = "";
    var btn = document.createElement("button");
    btn.id = "signInBtn";
    btn.className = "btn primary auth-signin-btn";
    btn.type = "button";
    btn.textContent = "Log In";
    btn.addEventListener("click", openAuthModal);
    els.authArea.appendChild(btn);
  }
}

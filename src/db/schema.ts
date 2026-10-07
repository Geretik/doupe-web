import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { RoleEdition, RoleTeam } from "../lib/botc-roles";
import type { GrimoireState } from "../lib/grimoire/state";

export const cities = ["olomouc", "praha"] as const;
export type City = (typeof cities)[number];

/** How players state when they come: exact arrival/departure times, or just an "I'll be late" tick. */
export const arrivalModes = ["times", "late"] as const;
export type ArrivalMode = (typeof arrivalModes)[number];

/** "open"; "not_open" = published, sign-ups open later; "paused" = sign-ups closed for now. */
export const registrationStates = ["open", "not_open", "paused"] as const;
export type RegistrationState = (typeof registrationStates)[number];

/** Language the game is played in; "both" = Czech and English at one table. */
export const gameLanguages = ["cs", "en", "both"] as const;
export type GameLanguage = (typeof gameLanguages)[number];

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** Which city the game night is in – the public site can filter by it */
  city: text("city", { enum: cities }).notNull().default("olomouc"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  place: text("place").notNull(),
  capacity: integer("capacity").notNull(),
  /** Who runs the game that night – free text, optional */
  storyteller: text("storyteller"),
  /** Shown to players with the session, so they know whether they will understand the game */
  gameLanguage: text("game_language", { enum: gameLanguages }).notNull().default("cs"),
  /** Set once the "N spots left" Discord post two days before the game went out */
  spotsPostedAt: timestamp("spots_posted_at", { withTimezone: true }),
  note: text("note"),
  /** "times" = players pick arrival/departure times; "late" = a single "I'll come later" checkbox (small groups) */
  arrivalMode: text("arrival_mode", { enum: arrivalModes }).notNull().default("times"),
  /** Whether the registration form insists on a phone number */
  phoneRequired: boolean("phone_required").notNull().default(true),
  /** New sign-ups only while "open"; players already signed up can always edit or cancel */
  registrationState: text("registration_state", { enum: registrationStates }).notNull().default("open"),
  /** Closed sign-ups open on their own at this moment (see lib/registration-state) */
  registrationOpensAt: timestamp("registration_opens_at", { withTimezone: true }),
  /** Links to scripts played that evening (botcscripts.com, script tool, PDF on a drive, …) */
  scripts: jsonb("scripts").$type<ScriptLink[]>().notNull().default([]),
  /** Music for the evening, shown to players on the session page (folded away); pasted in as a table in the admin */
  playlist: jsonb("playlist").$type<PlaylistTrack[]>().notNull().default([]),
  /** Scripts the signed-up players vote on through their edit link (the link may be empty); [] = no vote */
  scriptPoll: jsonb("script_poll").$type<ScriptLink[]>().notNull().default([]),
  /** Set when an organiser ended the vote early; it ends at the start of the session anyway */
  scriptPollClosedAt: timestamp("script_poll_closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScriptLink = { name: string; url: string };

/** One song of a session's playlist; the links lead to the download (the file or its page). */
export type PlaylistTrack = {
  title: string;
  author: string | null;
  license: string | null;
  links: { label: string; url: string }[];
};

export const registrations = pgTable(
  "registrations",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Optional since Sept 2026; older rows always have both */
    firstName: text("first_name"),
    lastName: text("last_name"),
    nickname: text("nickname").notNull(),
    email: text("email").notNull(),
    /** Optional contact phone for the organisers */
    phone: text("phone"),
    /** "HH:MM" in Europe/Prague, null = same as session start */
    arrivalTime: text("arrival_time"),
    /** "HH:MM" in Europe/Prague, null = same as session end */
    departureTime: text("departure_time"),
    /** Sessions with arrivalMode "late": the player ticked "I'll come later" */
    arrivesLate: boolean("arrives_late").notNull().default(false),
    status: text("status", { enum: ["confirmed", "waitlisted", "cancelled"] })
      .notNull()
      .default("confirmed"),
    /** When the player joined the waitlist – decides the order of promotion */
    waitlistedAt: timestamp("waitlisted_at", { withTimezone: true }),
    /** Player is willing to run the game as the Storyteller */
    canStorytell: boolean("can_storytell").notNull().default(false),
    /** Player is new to the game */
    isNewbie: boolean("is_newbie").notNull().default(false),
    /** Free-text note for the organisers, never shown publicly */
    note: text("note"),
    /** Why the player cancelled (optional) and when */
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Salted hash of the client IP, only for rate limiting sign-ups */
    ipHash: text("ip_hash"),
    /** Attendance marked by the organiser after the session; null = not marked */
    attended: boolean("attended"),
    /** Set when the "tomorrow is game night" reminder was sent – sent at most once */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /** UI language the player used; e-mails are sent in it */
    locale: text("locale", { enum: ["cs", "en"] }).notNull().default("cs"),
    /** Set once the confirmation e-mail for the current (re)activation was sent – never send it twice */
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    /** Last time any e-mail went to this registration – throttles "already registered" re-sends */
    lastEmailAt: timestamp("last_email_at", { withTimezone: true }),
    editToken: text("edit_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("registrations_session_email_idx").on(
      t.sessionId,
      sql`lower(${t.email})`,
    ),
  ],
);

/** One player's vote for one script of the session's poll; a player may vote for several. */
export const scriptVotes = pgTable(
  "script_votes",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    /** Name of the option in sessions.script_poll; votes for a renamed or removed option stop counting */
    script: text("script").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("script_votes_registration_script_idx").on(t.registrationId, t.script)],
);

export const gameWinners = ["good", "evil"] as const;
export type GameWinner = (typeof gameWinners)[number];

/** One played game of an evening: which script, who won, notes. Filled in by organisers afterwards. */
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  scriptName: text("script_name").notNull(),
  scriptUrl: text("script_url"),
  winner: text("winner", { enum: gameWinners }),
  /** Number of players at the table (optional) */
  players: integer("players"),
  notes: text("notes"),
  /** Not-in-play good characters the Demon was shown (character ids, up to 3); null = not entered */
  demonBluffs: jsonb("demon_bluffs").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Game = typeof games.$inferSelect;

/** Who played what in a recorded game: a player of the session and their character, or that they sat it out. */
export const gamePlayers = pgTable(
  "game_players",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    registrationId: integer("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    /** Character id from src/lib/botc-roles.ts ("washerwoman") or "storyteller"; null = did not play this game */
    role: text("role"),
    /** The character tied to `role`: who a Drunk, Lunatic or Marionette thought they were, which Townsfolk the Pixie learned, whose ability the Philosopher or Apprentice took (null = not entered) */
    believedRole: text("believed_role"),
  },
  (t) => [uniqueIndex("game_players_game_registration_idx").on(t.gameId, t.registrationId)],
);

export type GamePlayer = typeof gamePlayers.$inferSelect;

export const gamesRelations = relations(games, ({ one, many }) => ({
  session: one(sessions, { fields: [games.sessionId], references: [sessions.id] }),
  // "players" is the column with the number of players
  roster: many(gamePlayers),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.gameId], references: [games.id] }),
  registration: one(registrations, { fields: [gamePlayers.registrationId], references: [registrations.id] }),
}));

export const sessionsRelations = relations(sessions, ({ many }) => ({
  registrations: many(registrations),
  games: many(games),
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
  session: one(sessions, {
    fields: [registrations.sessionId],
    references: [sessions.id],
  }),
}));

export const adminRoles = ["admin", "organizer"] as const;
export type AdminRole = (typeof adminRoles)[number];

/** Organiser accounts for /admin. Passwords are stored as scrypt hashes (see lib/password.ts). */
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  nickname: text("nickname").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** admin = manages accounts and invites too; organizer = sessions and registrations only */
  role: text("role", { enum: adminRoles }).notNull().default("organizer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Login cookies issued before this stop working (password changed or reset) */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  /**
   * Secret of this organiser's own calendar feed (/admin/kalendar.ics?key=…): made when first shown, replaced
   * on request, gone with the account. 128 random bits, so no unique constraint: adding one to a table with
   * rows makes `drizzle-kit push` stop at a question it cannot ask in CI.
   */
  feedKey: text("feed_key"),
});

/** One-time links for setting a new password: made by an administrator, asked for by e-mail on the login page, or by scripts/reset-link.mjs. */
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** One-time invitation links; whoever opens one creates their own account. */
export const adminInvites = pgTable("admin_invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  role: text("role", { enum: adminRoles }).notNull().default("organizer"),
  /** Optional note for the admin, e.g. who the invite is for */
  note: text("note"),
  createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: integer("used_by").references(() => adminUsers.id, { onDelete: "set null" }),
});

/** Admin password attempts per network that were not right, for the login limit (lib/login-limit); the daily cron deletes old rows. */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: serial("id").primaryKey(),
    /** Salted hash of the IP, like registrations.ipHash */
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_failures_ip_hash_idx").on(t.ipHash, t.createdAt)],
);

export const linkKinds = ["my_games", "admin_reset", "message"] as const;
export type LinkKind = (typeof linkKinds)[number];

/** "Send me a link" requests ("my games", forgotten admin password) and messages from the club page, for throttling them (lib/link-throttle); the daily cron deletes old rows. */
export const linkRequests = pgTable(
  "link_requests",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: linkKinds }).notNull(),
    /** Keyed hash of the e-mail asked for, never the address itself */
    emailHash: text("email_hash").notNull(),
    /** Salted hash of the IP, like registrations.ipHash */
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("link_requests_email_hash_idx").on(t.emailHash, t.createdAt),
    index("link_requests_ip_hash_idx").on(t.ipHash, t.createdAt),
  ],
);

/**
 * Texts of the public pages edited in the admin (lib/site-content). Every change adds a row, so earlier versions
 * stay as history; the newest row of a block and language is shown. `body` null = back to the text in the code.
 */
export const siteTexts = pgTable(
  "site_texts",
  {
    id: serial("id").primaryKey(),
    /** Block id from lib/site-content-defaults.ts, e.g. "klub.body" */
    key: text("key").notNull(),
    locale: text("locale", { enum: ["cs", "en"] }).notNull(),
    /** Markdown (or plain text for one-line blocks); null = the default from the code */
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (t) => [index("site_texts_key_locale_idx").on(t.key, t.locale, t.id)],
);

/**
 * The club's library of Blood on the Clocktower scripts (admin → Scripty, lib/scripts): JSON files in the official
 * script format that every account sees; the session form offers them with a link to the script tool.
 */
export const scripts = pgTable("scripts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  author: text("author"),
  /** The script's JSON with `name` and `author` written into its "_meta"; downloaded as it is */
  json: text("json").notNull(),
  /** The characters of `json` this site knows (lib/botc-roles), for showing them; Fabled and homebrew are only in `json` */
  roleIds: jsonb("role_ids").$type<string[]>().notNull(),
  createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LibraryScript = typeof scripts.$inferSelect;

/** When a recurring job last finished; the admin warns when the daily cron stops running (lib/job-runs). */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
});

/*
 * Drafts (lib/draft). A draft is one draft as people see it: the row in `drafts` holds its setup – which
 * characters are offered, which of them are drafted together as one bundle – and its one row in
 * `draft_sessions` holds the run: mode, members, turn, picks, pools, scripts. Created together, one to one
 * (until October 2026 a Draft could have several sessions; the tables stayed so that nothing had to move).
 */

export const draftModeIds = ["personal", "shared"] as const;
export type DraftModeId = (typeof draftModeIds)[number];

/**
 * Which characters a Draft offers: those of the chosen editions and teams, or a hand-picked list
 * (character ids from lib/botc-roles, e.g. "washerwoman").
 */
export type DraftRoleSource =
  | { kind: "filter"; editions: RoleEdition[]; teams: RoleTeam[] }
  | { kind: "manual"; roleIds: string[] };

export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Who set it up; manages it together with administrators. Null once the account is deleted. */
  ownerId: integer("owner_id").references(() => adminUsers.id, { onDelete: "set null" }),
  note: text("note"),
  roleSource: jsonb("role_source").$type<DraftRoleSource>().notNull(),
  /** Characters drafted only together, as one pick, e.g. [["choirboy", "king"], ["huntsman", "damsel"]] */
  bundles: jsonb("bundles").$type<string[][]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Stored states of a session. "Waiting for players" and "ready" are not stored: they follow from the
 * members and the settings while it is "preparing" (lib/draft/state), so they cannot go stale when
 * somebody declines.
 */
export const draftSessionStatuses = ["preparing", "active", "completed", "cancelled"] as const;
export type DraftSessionStatus = (typeof draftSessionStatuses)[number];

export const draftSessions = pgTable(
  "draft_sessions",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    /** The draft's name, kept the same as drafts.name */
    name: text("name").notNull(),
    mode: text("mode", { enum: draftModeIds }).notNull(),
    /** Settings of the mode, e.g. { rolesPerParticipant: 15 }; fixed once the session starts */
    modeConfig: jsonb("mode_config").$type<Record<string, number>>().notNull(),
    status: text("status", { enum: draftSessionStatuses }).notNull().default("preparing"),
    /**
     * The turn, saved after every pick – the draft goes on where it stopped whenever someone comes back.
     * pickNumber = number of the next pick (1, 2, …); seat = place in the order (0-based) of the drafter on
     * turn; direction = 1 forwards, -1 backwards (snake); currentMemberId = the member on that seat.
     */
    pickNumber: integer("pick_number").notNull().default(1),
    seat: integer("seat"),
    direction: integer("direction").notNull().default(1),
    currentMemberId: integer("current_member_id"),
    createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("draft_sessions_draft_idx").on(t.draftId)],
);

/** owner = created the draft; organizer = may prepare, start and cancel it too; participant = drafts only. */
export const draftMemberRoles = ["owner", "organizer", "participant"] as const;
export type DraftMemberRole = (typeof draftMemberRoles)[number];

export const draftInviteStatuses = ["invited", "accepted", "declined"] as const;
export type DraftInviteStatus = (typeof draftInviteStatuses)[number];

/** Who belongs to a draft. Only those invited (and the owner): being an administrator does not make anyone a member. */
export const draftSessionMembers = pgTable(
  "draft_session_members",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    /** Null once the account is deleted; the row stays for the history */
    userId: integer("user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    /** The account's nickname when invited, shown once the account is gone */
    nickname: text("nickname").notNull(),
    role: text("role", { enum: draftMemberRoles }).notNull().default("participant"),
    /** Takes part in the picks; participants always, owners and organizers when they want to */
    drafts: boolean("drafts").notNull().default(true),
    status: text("status", { enum: draftInviteStatuses }).notNull().default("invited"),
    /** Place in the draft order (0-based) of a drafting member; null for the others */
    seat: integer("seat"),
    /** Language of the e-mails to this member: the inviter's, then the member's own once they answer */
    locale: text("locale", { enum: ["cs", "en"] }).notNull().default("cs"),
    invitedBy: integer("invited_by").references(() => adminUsers.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("draft_session_members_session_user_idx").on(t.sessionId, t.userId),
    index("draft_session_members_user_idx").on(t.userId),
  ],
);

/**
 * What can be picked in a session, fixed when it starts (later changes of the Draft do not reach it).
 * One row = one pick: a single character, or a bundle of characters drafted together.
 */
export const draftSessionOptions = pgTable(
  "draft_session_options",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    roleIds: jsonb("role_ids").$type<string[]>().notNull(),
  },
  (t) => [index("draft_session_options_session_idx").on(t.sessionId)],
);

/** Where picks go: one pool per drafter (personal mode) or one for everybody (shared mode, memberId null). */
export const draftPools = pgTable(
  "draft_pools",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    memberId: integer("member_id").references(() => draftSessionMembers.id, { onDelete: "cascade" }),
    /** How many characters the pool takes */
    target: integer("target").notNull(),
  },
  (t) => [index("draft_pools_session_idx").on(t.sessionId)],
);

/**
 * Every pick, in order; the session can be replayed from them. The unique indexes are the database's own
 * guard against two picks at once: one pick per number and each option at most once per session.
 */
export const draftPicks = pgTable(
  "draft_picks",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    pickNumber: integer("pick_number").notNull(),
    memberId: integer("member_id")
      .notNull()
      .references(() => draftSessionMembers.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => draftSessionOptions.id, { onDelete: "cascade" }),
    poolId: integer("pool_id")
      .notNull()
      .references(() => draftPools.id, { onDelete: "cascade" }),
    /** The characters the pick added, copied from the option */
    roleIds: jsonb("role_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("draft_picks_session_number_idx").on(t.sessionId, t.pickNumber),
    uniqueIndex("draft_picks_session_option_idx").on(t.sessionId, t.optionId),
  ],
);

/** A script made from a pool of a finished session; only characters of that pool (checked on every save). */
export const draftScripts = pgTable(
  "draft_scripts",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    poolId: integer("pool_id")
      .notNull()
      .references(() => draftPools.id, { onDelete: "cascade" }),
    createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    author: text("author"),
    /** Character ids in script order */
    roleIds: jsonb("role_ids").$type<string[]>().notNull(),
    /** Raised on every save; a save from a page with an older version is refused instead of overwriting */
    version: integer("version").notNull().default(1),
    /** Its copy in the club's library (lib/scripts), which "save to the library" overwrites from then on */
    libraryScriptId: integer("library_script_id").references(() => scripts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("draft_scripts_session_idx").on(t.sessionId)],
);

export const draftEventTypes = ["invited", "turn", "completed", "cancelled"] as const;
export type DraftEventType = (typeof draftEventTypes)[number];

/**
 * What happened in a session that someone should hear about (lib/draft/events). Written in the same
 * transaction as the change itself, sent once due (e-mail now; Discord or more later); the daily cron
 * retries what failed.
 */
export const draftEvents = pgTable(
  "draft_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    type: text("type", { enum: draftEventTypes }).notNull(),
    /** Whom it is about: the invited member, the member now on turn; null = all members */
    memberId: integer("member_id").references(() => draftSessionMembers.id, { onDelete: "cascade" }),
    /** Pick number for "turn" */
    pickNumber: integer("pick_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Not sent before this: a turn only once the drafter has let it wait a day (TURN_REMINDER_HOURS) */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    /** Claimed or sent; null = still to send */
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    /** How many people it went to; 0 = nobody any more (the drafter picked in time, the invitation was answered) */
    recipients: integer("recipients"),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [index("draft_events_pending_idx").on(t.dispatchedAt, t.dueAt)],
);

/**
 * A Storyteller's online grimoire: the seats, characters, reminders and the night of one game, kept as one
 * JSON document (lib/grimoire/state) that the page saves as it changes. Only its owner sees it until the
 * game ends; ending it writes the game record of its session (games, game_players).
 */
export const grimoires = pgTable(
  "grimoires",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    /** The session whose players it started from and whose games it records; null = a grimoire on its own */
    sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
    /** The game record it wrote when the game ended; ending it again updates that one */
    gameId: integer("game_id").references(() => games.id, { onDelete: "set null" }),
    state: jsonb("state").$type<GrimoireState>().notNull(),
    /** Raised by every save: a save from a page that started from an older version is refused */
    version: integer("version").notNull().default(1),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grimoires_owner_idx").on(t.ownerId), index("grimoires_session_idx").on(t.sessionId)],
);

export type Grimoire = typeof grimoires.$inferSelect;

export type Draft = typeof drafts.$inferSelect;
export type DraftSession = typeof draftSessions.$inferSelect;
export type DraftSessionMember = typeof draftSessionMembers.$inferSelect;
export type DraftSessionOption = typeof draftSessionOptions.$inferSelect;
export type DraftPool = typeof draftPools.$inferSelect;
export type DraftPick = typeof draftPicks.$inferSelect;
export type DraftScript = typeof draftScripts.$inferSelect;
export type DraftEvent = typeof draftEvents.$inferSelect;

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminInvite = typeof adminInvites.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type RegistrationStatus = Registration["status"];

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

export const linkKinds = ["my_games", "admin_reset"] as const;
export type LinkKind = (typeof linkKinds)[number];

/** "Send me a link" requests ("my games", forgotten admin password), for throttling them (lib/link-throttle); the daily cron deletes old rows. */
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

/** When a recurring job last finished; the admin warns when the daily cron stops running (lib/job-runs). */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminInvite = typeof adminInvites.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type RegistrationStatus = Registration["status"];

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScriptLink = { name: string; url: string };

/** Tables of one evening when there are too many players for a single game (7–15 per table). */
export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  /** 1-based number shown to players ("Stůl 2") */
  number: integer("number").notNull(),
  /** Optional: who runs this table (free text, may differ from the session's storyteller) */
  storyteller: text("storyteller"),
  /** Set once the "you sit at table N" e-mails went out */
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

export type Table = typeof tables.$inferSelect;

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
    /** Table the player sits at (null = not assigned / single table) */
    tableId: integer("table_id").references(() => tables.id, { onDelete: "set null" }),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Game = typeof games.$inferSelect;

export const gamesRelations = relations(games, ({ one }) => ({
  session: one(sessions, { fields: [games.sessionId], references: [sessions.id] }),
}));

export const sessionsRelations = relations(sessions, ({ many }) => ({
  registrations: many(registrations),
  games: many(games),
  tables: many(tables),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
  session: one(sessions, { fields: [tables.sessionId], references: [sessions.id] }),
  registrations: many(registrations),
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
  session: one(sessions, {
    fields: [registrations.sessionId],
    references: [sessions.id],
  }),
  table: one(tables, { fields: [registrations.tableId], references: [tables.id] }),
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
  /** Secret of this organiser's own calendar feed (/admin/kalendar.ics?key=…): made when first shown, replaced on request, gone with the account */
  feedKey: text("feed_key").unique(),
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

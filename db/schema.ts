import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const members=sqliteTable('members',{
 userId:text('user_id').primaryKey(),email:text('email').notNull(),role:text('role').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull()
},t=>[uniqueIndex('members_email_unique').on(t.email)]);
export const invitations=sqliteTable('invitations',{
 email:text('email').primaryKey(),role:text('role').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull()
});
export const privateState=sqliteTable('private_state',{
 userId:text('user_id').notNull().references(()=>members.userId),key:text('key').notNull(),value:text('value').notNull(),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.userId,t.key]})]);
export const audit=sqliteTable('account_audit',{
 id:integer('id').primaryKey({autoIncrement:true}),actorId:text('actor_id').notNull(),action:text('action').notNull(),target:text('target').notNull(),createdAt:text('created_at').notNull()
});

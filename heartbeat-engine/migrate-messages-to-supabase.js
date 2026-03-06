#!/usr/bin/env node
/**
 * MIGRATION SCRIPT: Railway Postgres → Supabase
 * Copies all chat messages from Railway to Supabase messages table
 * Preserves Sarah's complete conversation history
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Pool } = pg;

// Railway Postgres connection
const railwayPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL,
  ssl: { rejectUnauthorized: false }
});

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateMessages() {
  console.log('🚀 Starting migration: Railway → Supabase');
  console.log('=' .repeat(60));
  
  try {
    // Fetch all messages from Railway
    console.log('\n📥 Fetching messages from Railway Postgres...');
    const result = await railwayPool.query(`
      SELECT 
        m.session_id as conversation_id,
        m.role as type,
        m.content as text,
        m.created_at as timestamp
      FROM chat_messages m
      ORDER BY m.created_at ASC
    `);
    
    console.log(`✅ Found ${result.rows.length} messages in Railway`);
    
    if (result.rows.length === 0) {
      console.log('✨ No messages to migrate');
      return;
    }
    
    // Insert into Supabase in batches
    console.log('\n📤 Migrating to Supabase messages table...');
    const batchSize = 100;
    let migrated = 0;
    let errors = 0;
    
    for (let i = 0; i < result.rows.length; i += batchSize) {
      const batch = result.rows.slice(i, i + batchSize);
      
      // Map Railway schema to Supabase schema
      const supabaseMessages = batch.map(msg => ({
        conversation_id: msg.conversation_id,
        type: msg.type === 'assistant' ? 'sarah' : msg.type, // Map 'assistant' → 'sarah'
        text: msg.text,
        timestamp: msg.timestamp
      }));
      
      const { data, error } = await supabase
        .from('messages')
        .upsert(supabaseMessages, {
          onConflict: 'conversation_id,timestamp', // Avoid duplicates
          ignoreDuplicates: true
        });
      
      if (error) {
        console.error(`❌ Error in batch ${i}-${i + batch.length}:`, error);
        errors += batch.length;
      } else {
        migrated += batch.length;
        process.stdout.write(`\r   Migrated: ${migrated}/${result.rows.length} messages`);
      }
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY:');
    console.log(`   Total messages: ${result.rows.length}`);
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('='.repeat(60));
    
    if (migrated > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('   Sarah now has access to all her conversation history in Supabase');
    }
    
  } catch (err) {
    console.error('\n💥 Migration failed:', err);
    throw err;
  } finally {
    await railwayPool.end();
  }
}

// Run migration
migrateMessages().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

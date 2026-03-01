import React, { useState, useEffect } from 'react';

function ToolInventory({ theme, refreshContext }) {
  const [toolData, setToolData] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchToolData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('tools', fetchToolData);
      return cleanup;
    } else {
      const interval = setInterval(fetchToolData, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchToolData = async () => {
    try {
      // Simulate comprehensive tool inventory data
      // In a real implementation, this would come from the backend
      setToolData({
        ghlTools: [
          // CONTACTS (5 tools)
          { name: 'ghl_search_contacts', category: 'contacts', risk: 'low', level: 1, usage: 45 },
          { name: 'ghl_get_contact', category: 'contacts', risk: 'low', level: 1, usage: 32 },
          { name: 'ghl_create_contact', category: 'contacts', risk: 'medium', level: 2, usage: 18 },
          { name: 'ghl_update_contact', category: 'contacts', risk: 'medium', level: 2, usage: 23 },
          { name: 'ghl_delete_contact', category: 'contacts', risk: 'high', level: 3, usage: 2 },

          // COMMUNICATION (2 tools)
          { name: 'ghl_send_message', category: 'communication', risk: 'medium', level: 2, usage: 67 },
          { name: 'ghl_get_conversations', category: 'communication', risk: 'low', level: 1, usage: 28 },

          // SCHEDULING (3 tools)
          { name: 'ghl_list_calendars', category: 'scheduling', risk: 'low', level: 1, usage: 15 },
          { name: 'ghl_get_calendar_slots', category: 'scheduling', risk: 'low', level: 1, usage: 22 },
          { name: 'ghl_create_appointment', category: 'scheduling', risk: 'medium', level: 2, usage: 14 },

          // SALES/OPPORTUNITIES (5 tools)
          { name: 'ghl_search_opportunities', category: 'sales', risk: 'low', level: 1, usage: 35 },
          { name: 'ghl_create_opportunity', category: 'sales', risk: 'high', level: 3, usage: 8 },
          { name: 'ghl_update_opportunity_stage', category: 'sales', risk: 'high', level: 3, usage: 12 },
          { name: 'ghl_list_pipelines', category: 'sales', risk: 'low', level: 1, usage: 9 },
          { name: 'ghl_get_pipeline_stages', category: 'sales', risk: 'low', level: 1, usage: 11 },

          // TASKS (3 tools)
          { name: 'ghl_list_tasks', category: 'tasks', risk: 'low', level: 1, usage: 18 },
          { name: 'ghl_create_task', category: 'tasks', risk: 'medium', level: 2, usage: 25 },
          { name: 'ghl_update_task', category: 'tasks', risk: 'medium', level: 2, usage: 19 },

          // NOTES (2 tools)
          { name: 'ghl_get_notes', category: 'notes', risk: 'low', level: 1, usage: 12 },
          { name: 'ghl_create_note', category: 'notes', risk: 'medium', level: 2, usage: 16 },

          // TAGS (5 tools)
          { name: 'ghl_get_contact_tags', category: 'tags', risk: 'low', level: 1, usage: 8 },
          { name: 'ghl_add_contact_tag', category: 'tags', risk: 'medium', level: 2, usage: 21 },
          { name: 'ghl_remove_contact_tag', category: 'tags', risk: 'medium', level: 2, usage: 7 },
          { name: 'ghl_create_location_tag', category: 'tags', risk: 'medium', level: 2, usage: 4 },
          { name: 'ghl_delete_location_tag', category: 'tags', risk: 'high', level: 3, usage: 1 },

          // AUTOMATION (2 tools)
          { name: 'ghl_list_workflows', category: 'automation', risk: 'low', level: 1, usage: 6 },
          { name: 'ghl_add_contact_to_workflow', category: 'automation', risk: 'medium', level: 2, usage: 13 },

          // MARKETING (2 tools)
          { name: 'ghl_list_campaigns', category: 'marketing', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_get_campaign_stats', category: 'marketing', risk: 'low', level: 1, usage: 5 },

          // INVOICES (6 tools)
          { name: 'ghl_list_invoices', category: 'invoices', risk: 'low', level: 1, usage: 12 },
          { name: 'ghl_get_invoice', category: 'invoices', risk: 'low', level: 1, usage: 8 },
          { name: 'ghl_create_invoice', category: 'invoices', risk: 'medium', level: 2, usage: 5 },
          { name: 'ghl_update_invoice', category: 'invoices', risk: 'medium', level: 2, usage: 3 },
          { name: 'ghl_send_invoice', category: 'invoices', risk: 'medium', level: 2, usage: 7 },
          { name: 'ghl_void_invoice', category: 'invoices', risk: 'high', level: 3, usage: 1 },

          // ESTIMATES (5 tools)
          { name: 'ghl_list_estimates', category: 'estimates', risk: 'low', level: 1, usage: 6 },
          { name: 'ghl_get_estimate', category: 'estimates', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_create_estimate', category: 'estimates', risk: 'medium', level: 2, usage: 3 },
          { name: 'ghl_update_estimate', category: 'estimates', risk: 'medium', level: 2, usage: 2 },
          { name: 'ghl_send_estimate', category: 'estimates', risk: 'medium', level: 2, usage: 4 },

          // PRODUCTS (5 tools)
          { name: 'ghl_list_products', category: 'products', risk: 'low', level: 1, usage: 8 },
          { name: 'ghl_get_product', category: 'products', risk: 'low', level: 1, usage: 5 },
          { name: 'ghl_create_product', category: 'products', risk: 'medium', level: 2, usage: 2 },
          { name: 'ghl_update_product', category: 'products', risk: 'medium', level: 2, usage: 3 },
          { name: 'ghl_delete_product', category: 'products', risk: 'high', level: 3, usage: 1 },

          // PAYMENTS (3 tools)
          { name: 'ghl_list_payments', category: 'payments', risk: 'low', level: 1, usage: 15 },
          { name: 'ghl_get_payment', category: 'payments', risk: 'low', level: 1, usage: 9 },
          { name: 'ghl_refund_payment', category: 'payments', risk: 'high', level: 3, usage: 2 },

          // FORMS (3 tools)
          { name: 'ghl_list_forms', category: 'forms', risk: 'low', level: 1, usage: 7 },
          { name: 'ghl_get_form', category: 'forms', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_get_form_submissions', category: 'forms', risk: 'low', level: 1, usage: 11 },

          // SURVEYS (3 tools)
          { name: 'ghl_list_surveys', category: 'surveys', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_get_survey', category: 'surveys', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_survey_submissions', category: 'surveys', risk: 'low', level: 1, usage: 5 },

          // FUNNELS (3 tools)
          { name: 'ghl_list_funnels', category: 'funnels', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_get_funnel', category: 'funnels', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_funnel_pages', category: 'funnels', risk: 'low', level: 1, usage: 3 },

          // WEBSITES (3 tools)
          { name: 'ghl_list_websites', category: 'websites', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_website', category: 'websites', risk: 'low', level: 1, usage: 1 },
          { name: 'ghl_list_pages', category: 'websites', risk: 'low', level: 1, usage: 3 },

          // MEDIA (3 tools)
          { name: 'ghl_list_media', category: 'media', risk: 'low', level: 1, usage: 6 },
          { name: 'ghl_upload_media', category: 'media', risk: 'medium', level: 2, usage: 4 },
          { name: 'ghl_delete_media', category: 'media', risk: 'high', level: 3, usage: 1 },

          // COURSES (4 tools)
          { name: 'ghl_list_courses', category: 'courses', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_get_course', category: 'courses', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_course_lessons', category: 'courses', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_enroll_contact_in_course', category: 'courses', risk: 'medium', level: 2, usage: 1 },

          // EMAIL BUILDER (3 tools)
          { name: 'ghl_list_email_templates', category: 'email_builder', risk: 'low', level: 1, usage: 5 },
          { name: 'ghl_get_email_template', category: 'email_builder', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_create_email_template', category: 'email_builder', risk: 'medium', level: 2, usage: 2 },

          // SOCIAL PLANNER (3 tools)
          { name: 'ghl_list_social_posts', category: 'social_planner', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_create_social_post', category: 'social_planner', risk: 'medium', level: 2, usage: 3 },
          { name: 'ghl_schedule_social_post', category: 'social_planner', risk: 'medium', level: 2, usage: 2 },

          // BLOG (4 tools)
          { name: 'ghl_list_blog_posts', category: 'blog', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_blog_post', category: 'blog', risk: 'low', level: 1, usage: 1 },
          { name: 'ghl_create_blog_post', category: 'blog', risk: 'medium', level: 2, usage: 1 },
          { name: 'ghl_update_blog_post', category: 'blog', risk: 'medium', level: 2, usage: 1 },

          // DOCUMENTS (3 tools)
          { name: 'ghl_list_documents', category: 'documents', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_get_document', category: 'documents', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_send_document_for_signature', category: 'documents', risk: 'medium', level: 2, usage: 1 },

          // CUSTOM VALUES (3 tools)
          { name: 'ghl_list_custom_values', category: 'custom_values', risk: 'low', level: 1, usage: 4 },
          { name: 'ghl_create_custom_value', category: 'custom_values', risk: 'medium', level: 2, usage: 2 },
          { name: 'ghl_delete_custom_value', category: 'custom_values', risk: 'high', level: 3, usage: 1 },

          // CUSTOM FIELDS (2 tools)
          { name: 'ghl_get_custom_fields', category: 'custom_fields', risk: 'low', level: 1, usage: 8 },
          { name: 'ghl_update_contact_custom_field', category: 'custom_fields', risk: 'medium', level: 2, usage: 12 },

          // BUSINESSES (2 tools)
          { name: 'ghl_list_businesses', category: 'businesses', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_get_business', category: 'businesses', risk: 'low', level: 1, usage: 1 },

          // TRIGGER LINKS (2 tools)
          { name: 'ghl_list_trigger_links', category: 'trigger_links', risk: 'low', level: 1, usage: 1 },
          { name: 'ghl_create_trigger_link', category: 'trigger_links', risk: 'medium', level: 2, usage: 1 },

          // VOICE AI (3 tools)
          { name: 'ghl_list_voice_calls', category: 'voice_ai', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_get_call_recording', category: 'voice_ai', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_list_phone_numbers', category: 'voice_ai', risk: 'low', level: 1, usage: 1 },

          // CUSTOM OBJECTS (3 tools)
          { name: 'ghl_list_custom_objects', category: 'custom_objects', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_create_custom_object_record', category: 'custom_objects', risk: 'medium', level: 2, usage: 1 },
          { name: 'ghl_get_custom_object_records', category: 'custom_objects', risk: 'low', level: 1, usage: 3 },

          // USERS (4 tools)
          { name: 'ghl_list_users', category: 'users', risk: 'low', level: 1, usage: 3 },
          { name: 'ghl_get_user', category: 'users', risk: 'low', level: 1, usage: 2 },
          { name: 'ghl_update_user', category: 'users', risk: 'medium', level: 2, usage: 1 },
          { name: 'ghl_get_location_info', category: 'users', risk: 'low', level: 1, usage: 5 }
        ],
        internalTools: [
          { name: 'bloom_create_task', category: 'planning', risk: 'low', level: 2, usage: 34 },
          { name: 'bloom_list_tasks', category: 'planning', risk: 'low', level: 1, usage: 28 },
          { name: 'bloom_update_task', category: 'planning', risk: 'low', level: 2, usage: 31 },
          { name: 'bloom_log_decision', category: 'logging', risk: 'low', level: 1, usage: 52 },
          { name: 'bloom_log_observation', category: 'logging', risk: 'low', level: 1, usage: 19 },
          { name: 'bloom_store_context', category: 'memory', risk: 'low', level: 2, usage: 15 },
          { name: 'bloom_retrieve_context', category: 'memory', risk: 'low', level: 1, usage: 23 },
          { name: 'bloom_escalate_issue', category: 'escalation', risk: 'medium', level: 2, usage: 6 },
          { name: 'bloom_analyze_patterns', category: 'analysis', risk: 'low', level: 1, usage: 8 },
          { name: 'bloom_generate_summary', category: 'analysis', risk: 'low', level: 1, usage: 12 },
          { name: 'bloom_delegate_task', category: 'delegation', risk: 'medium', level: 2, usage: 15 },
          { name: 'bloom_list_subagents', category: 'delegation', risk: 'low', level: 1, usage: 9 },
          { name: 'bloom_recommend_subagent', category: 'delegation', risk: 'low', level: 1, usage: 12 }
        ]
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch tool data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getAllTools = () => {
    if (!toolData) return [];
    return [...toolData.ghlTools, ...toolData.internalTools];
  };

  const getFilteredTools = () => {
    const allTools = getAllTools();
    if (activeCategory === 'all') return allTools;
    return allTools.filter(tool => tool.category === activeCategory);
  };

  const getCategories = () => {
    const allTools = getAllTools();
    const categories = [...new Set(allTools.map(tool => tool.category))];
    return ['all', ...categories.sort()];
  };

  const getCategoryStats = () => {
    const allTools = getAllTools();
    const stats = {};

    allTools.forEach(tool => {
      if (!stats[tool.category]) {
        stats[tool.category] = { count: 0, totalUsage: 0 };
      }
      stats[tool.category].count++;
      stats[tool.category].totalUsage += tool.usage;
    });

    return stats;
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'low': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
      case 'critical': return '#7C2D12';
      default: return '#6B7280';
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 1: return '#6366F1';
      case 2: return '#10B981';
      case 3: return '#F59E0B';
      case 4: return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getUsageColor = (usage) => {
    if (usage >= 50) return '#10B981'; // High usage - green
    if (usage >= 20) return '#F59E0B'; // Medium usage - yellow
    if (usage >= 5) return '#6366F1';  // Low usage - blue
    return '#6B7280'; // Very low usage - gray
  };

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      borderRadius: 8,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    icon: {
      fontSize: 20,
    },
    stats: {
      display: 'flex',
      gap: 16,
      fontSize: 12,
      color: '#6B7280',
    },
    stat: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    },
    filters: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    filterButton: {
      padding: '6px 12px',
      backgroundColor: '#f3f4f6',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: '500',
      color: '#374151',
      transition: 'all 0.2s',
    },
    activeFilter: {
      backgroundColor: '#6366F1',
      color: 'white',
      borderColor: '#6366F1',
    },
    toolGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: 12,
    },
    toolCard: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
      transition: 'all 0.2s',
    },
    toolHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    toolName: {
      fontSize: 13,
      fontWeight: '600',
      color: '#111827',
      fontFamily: 'monospace',
    },
    toolBadges: {
      display: 'flex',
      gap: 4,
    },
    badge: {
      padding: '2px 6px',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
    },
    toolMeta: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 11,
      color: '#6B7280',
    },
    usageBar: {
      width: 40,
      height: 6,
      backgroundColor: '#e5e7eb',
      borderRadius: 3,
      overflow: 'hidden',
    },
    usageBarFill: {
      height: '100%',
      borderRadius: 3,
      transition: 'width 0.3s ease',
    },
    loadingState: {
      textAlign: 'center',
      padding: 20,
      color: '#6B7280',
    },
    errorState: {
      textAlign: 'center',
      padding: 20,
      color: '#EF4444',
      backgroundColor: '#FEF2F2',
      borderRadius: 6,
      border: '1px solid #FECACA',
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🛠️</span>
            Tool Inventory
          </h3>
        </div>
        <div style={styles.loadingState}>Loading tool inventory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🛠️</span>
            Tool Inventory
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load tool inventory: {error}
        </div>
      </div>
    );
  }

  const allTools = getAllTools();
  const filteredTools = getFilteredTools();
  const categories = getCategories();
  const categoryStats = getCategoryStats();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🛠️</span>
          Tool Inventory
        </h3>
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span>Total:</span>
            <strong>{allTools.length}</strong>
          </div>
          <div style={styles.stat}>
            <span>GHL API:</span>
            <strong>{toolData.ghlTools.length}</strong>
          </div>
          <div style={styles.stat}>
            <span>Internal:</span>
            <strong>{toolData.internalTools.length}</strong>
          </div>
          <div style={styles.stat}>
            <span>Categories:</span>
            <strong>{categories.length - 1}</strong>
          </div>
        </div>
      </div>

      <div style={styles.filters}>
        {categories.map((category) => (
          <button
            key={category}
            style={{
              ...styles.filterButton,
              ...(activeCategory === category ? styles.activeFilter : {})
            }}
            onClick={() => setActiveCategory(category)}
          >
            {category === 'all' ? 'All Tools' : category.charAt(0).toUpperCase() + category.slice(1)}
            {category !== 'all' && categoryStats[category] && (
              <span style={{ marginLeft: 4 }}>({categoryStats[category].count})</span>
            )}
          </button>
        ))}
      </div>

      <div style={styles.toolGrid}>
        {filteredTools.map((tool, index) => (
          <div key={index} style={styles.toolCard}>
            <div style={styles.toolHeader}>
              <div style={styles.toolName}>{tool.name}</div>
              <div style={styles.toolBadges}>
                <span style={{
                  ...styles.badge,
                  backgroundColor: getRiskColor(tool.risk)
                }}>
                  {tool.risk}
                </span>
                <span style={{
                  ...styles.badge,
                  backgroundColor: getLevelColor(tool.level)
                }}>
                  L{tool.level}
                </span>
              </div>
            </div>
            <div style={styles.toolMeta}>
              <span>{tool.category}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{tool.usage} uses</span>
                <div style={styles.usageBar}>
                  <div
                    style={{
                      ...styles.usageBarFill,
                      width: `${Math.min((tool.usage / 70) * 100, 100)}%`,
                      backgroundColor: getUsageColor(tool.usage)
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ToolInventory;
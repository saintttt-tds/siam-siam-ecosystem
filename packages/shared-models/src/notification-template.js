const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Notification Template Model - Reusable Notification Templates
 * 
 * Stores templates for consistent notification messaging across all channels.
 * Supports variable interpolation, multi-language versions, and version control.
 * Templates can be system-managed or custom-created by tenants.
 * 
 * TABLE: notification_templates
 * 
 * TEMPLATE VARIABLES:
 * Templates use {{variableName}} syntax for dynamic content.
 * Variables are validated and sanitized before rendering.
 * Default values can be specified for missing variables.
 * 
 * VERSIONING:
 * Templates are versioned (1, 2, 3...). Only the latest version is active.
 * Previous versions are kept for audit trail and rollback capability.
 * New versions can be created from existing templates.
 */

class NotificationTemplate extends BaseModel {
  static tableName = 'notification_templates';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'type', 'category', 'channel',
    // Content templates by channel
    'subject_template', 'preheader_template',
    'body_template', 'html_template', 'text_template',
    'sms_template', 'push_title_template',
    'push_body_template', 'push_subtitle_template',
    'whatsapp_template', 'whatsapp_template_name',
    'whatsapp_template_namespace', 'voice_template',
    'in_app_title_template', 'in_app_body_template',
    // Variables and defaults
    'variables', 'required_variables',
    'default_data', 'sample_data',
    'variable_descriptions', 'variable_validators',
    // Localization
    'language', 'locale', 'is_default_locale',
    'parent_template_id', 'translated_from_id',
    // Versioning
    'version', 'is_active', 'is_latest',
    'previous_version_id', 'changelog',
    // Classification
    'is_system', 'is_custom', 'is_deprecated',
    'owner_id', 'owner_type',
    // Rendering options
    'render_engine', 'auto_escape', 'strict_variables',
    'trim_blocks', 'lstrip_blocks',
    // Actions
    'default_action_url', 'default_action_text',
    'default_icon_url', 'default_image_url',
    // Tracking
    'tracking_enabled', 'open_tracking_enabled',
    'click_tracking_enabled', 'utm_defaults',
    // Scheduling
    'delivery_window_start', 'delivery_window_end',
    'timezone', 'quiet_hours_enabled',
    // Priority
    'default_priority', 'default_importance',
    'is_time_sensitive',
    // A/B testing
    'ab_testing_enabled', 'ab_test_variants',
    // Compliance
    'include_unsubscribe', 'unsubscribe_text',
    'include_preferences', 'preferences_text',
    'gdpr_compliant', 'required_consents',
    // Preview
    'preview_data', 'preview_subject',
    'preview_body', 'last_previewed_at',
    // Usage statistics
    'use_count', 'last_used_at',
    'success_rate', 'avg_open_rate', 'avg_click_rate',
    // Tags and metadata
    'tags', 'metadata',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    variables: 'json', required_variables: 'json',
    default_data: 'json', sample_data: 'json',
    variable_descriptions: 'json', variable_validators: 'json',
    ab_test_variants: 'json', required_consents: 'json',
    utm_defaults: 'json', metadata: 'json', tags: 'json',
    is_active: 'boolean', is_latest: 'boolean',
    is_system: 'boolean', is_custom: 'boolean',
    is_deprecated: 'boolean', is_default_locale: 'boolean',
    auto_escape: 'boolean', strict_variables: 'boolean',
    trim_blocks: 'boolean', lstrip_blocks: 'boolean',
    tracking_enabled: 'boolean', open_tracking_enabled: 'boolean',
    click_tracking_enabled: 'boolean', quiet_hours_enabled: 'boolean',
    is_time_sensitive: 'boolean', ab_testing_enabled: 'boolean',
    gdpr_compliant: 'boolean', include_unsubscribe: 'boolean',
    include_preferences: 'boolean',
    default_priority: 'integer', default_importance: 'integer',
    use_count: 'integer', success_rate: 'float',
    avg_open_rate: 'float', avg_click_rate: 'float',
  };

  static channels = ['email', 'sms', 'push', 'whatsapp', 'in_app', 'voice'];

  static categories = {
    TRANSACTIONAL: 'transactional', PROMOTIONAL: 'promotional',
    SYSTEM: 'system', SECURITY: 'security', ONBOARDING: 'onboarding',
    RETENTION: 'retention', SOCIAL: 'social', CUSTOM: 'custom',
  };

  /**
   * Find active template by name and channel
   */
  static async findByName(name, channel = 'email') {
    return this.findOne({
      where: { name, channel, is_active: true, is_latest: true },
      orderBy: { version: 'DESC' },
    });
  }

  /**
   * Find active template by slug and channel
   */
  static async findBySlug(slug, channel = 'email') {
    return this.findOne({
      where: { slug, channel, is_active: true, is_latest: true },
      orderBy: { version: 'DESC' },
    });
  }

  /**
   * Find template by type
   */
  static async findByType(type, channel = 'email') {
    return this.findOne({
      where: { type, channel, is_active: true, is_latest: true },
      orderBy: { version: 'DESC' },
    });
  }

  /**
   * Render a template with variables
   */
  static async render(name, channel, variables = {}, options = {}) {
    const template = await this.findByName(name, channel);
    if (!template) {
      throw new Error(`Template not found: ${name} for channel ${channel}`);
    }

    // Merge default data with provided variables
    const allVars = {
      ...(template.default_data || {}),
      ...variables,
      ...(options.additionalVariables || {}),
    };

    // Validate required variables
    if (template.required_variables && template.required_variables.length > 0) {
      const missing = template.required_variables.filter(v => !allVars[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required variables: ${missing.join(', ')}`);
      }
    }

    // Render subject
    let subject = this._interpolate(template.subject_template || '', allVars, template);
    let preheader = this._interpolate(template.preheader_template || '', allVars, template);
    let body = this._interpolate(template.body_template || '', allVars, template);
    let html = this._interpolate(template.html_template || '', allVars, template);
    let text = this._interpolate(template.text_template || '', allVars, template);
    let sms = this._interpolate(template.sms_template || '', allVars, template);
    let pushTitle = this._interpolate(template.push_title_template || '', allVars, template);
    let pushBody = this._interpolate(template.push_body_template || '', allVars, template);
    let pushSubtitle = this._interpolate(template.push_subtitle_template || '', allVars, template);
    let whatsapp = this._interpolate(template.whatsapp_template || '', allVars, template);
    let inAppTitle = this._interpolate(template.in_app_title_template || '', allVars, template);
    let inAppBody = this._interpolate(template.in_app_body_template || '', allVars, template);

    // Apply conditional blocks
    subject = this._processConditionals(subject, allVars);
    body = this._processConditionals(body, allVars);
    html = this._processConditionals(html, allVars);
    text = this._processConditionals(text, allVars);
    sms = this._processConditionals(sms, allVars);

    // Track template usage
    await this._recordUsage(template.id);

    return {
      subject, preheader, body, html, text, sms,
      pushTitle, pushBody, pushSubtitle, whatsapp,
      inAppTitle, inAppBody,
      templateName: template.name,
      templateVersion: template.version,
      templateSlug: template.slug,
      channel,
      renderedAt: new Date().toISOString(),
    };
  }

  /**
   * Create a new version of an existing template
   */
  static async createNewVersion(templateId, updates, createdBy = 'system') {
    const current = await this.findById(templateId);
    if (!current) throw new Error('Template not found');

    // Mark current version as not latest
    await this.update({ id: templateId }, { is_latest: false });

    // Create new version
    const newVersion = current.version + 1;
    const newTemplate = await this.create({
      name: current.name,
      slug: current.slug,
      description: updates.description || current.description,
      type: current.type,
      category: current.category,
      channel: current.channel,
      subject_template: updates.subjectTemplate || current.subject_template,
      preheader_template: updates.preheaderTemplate || current.preheader_template,
      body_template: updates.bodyTemplate || current.body_template,
      html_template: updates.htmlTemplate || current.html_template,
      text_template: updates.textTemplate || current.text_template,
      sms_template: updates.smsTemplate || current.sms_template,
      push_title_template: updates.pushTitleTemplate || current.push_title_template,
      push_body_template: updates.pushBodyTemplate || current.push_body_template,
      push_subtitle_template: updates.pushSubtitleTemplate || current.push_subtitle_template,
      whatsapp_template: updates.whatsappTemplate || current.whatsapp_template,
      in_app_title_template: updates.inAppTitleTemplate || current.in_app_title_template,
      in_app_body_template: updates.inAppBodyTemplate || current.in_app_body_template,
      variables: updates.variables || current.variables,
      required_variables: updates.requiredVariables || current.required_variables,
      default_data: updates.defaultData || current.default_data,
      language: current.language,
      locale: current.locale,
      version: newVersion,
      is_active: true,
      is_latest: true,
      is_system: current.is_system,
      is_custom: current.is_custom,
      owner_id: current.owner_id,
      owner_type: current.owner_type,
      previous_version_id: templateId,
      changelog: updates.changelog || 'Updated template',
      render_engine: current.render_engine,
      tracking_enabled: current.tracking_enabled,
      default_priority: current.default_priority,
      metadata: { ...(current.metadata || {}), createdFromVersion: current.version },
      tenant_id: current.tenant_id,
      created_by: createdBy,
    });

    logger.info('Notification template version created', {
      templateName: current.name,
      oldVersion: current.version,
      newVersion,
    });

    return newTemplate;
  }

  /**
   * Get all active templates
   */
  static async getActive(options = {}) {
    return this.findAll({
      where: { is_active: true, is_latest: true, ...options.where },
      orderBy: { name: 'ASC', channel: 'ASC' },
      ...options,
    });
  }

  /**
   * Get templates by category
   */
  static async getByCategory(category, channel = null) {
    const criteria = { category, is_active: true, is_latest: true };
    if (channel) criteria.channel = channel;
    return this.findAll({ where: criteria, orderBy: { name: 'ASC' } });
  }

  /**
   * Validate template variables
   */
  static validateVariables(template, variables) {
    const errors = [];
    const warnings = [];

    // Check required variables
    if (template.required_variables) {
      for (const required of template.required_variables) {
        if (!variables[required] && !(template.default_data || {})[required]) {
          errors.push(`Missing required variable: ${required}`);
        }
      }
    }

    // Check variable types if validators defined
    if (template.variable_validators) {
      for (const [varName, validator] of Object.entries(template.variable_validators)) {
        if (variables[varName] && validator.pattern) {
          const regex = new RegExp(validator.pattern);
          if (!regex.test(String(variables[varName]))) {
            errors.push(validator.message || `Invalid format for variable: ${varName}`);
          }
        }
        if (variables[varName] && validator.maxLength && String(variables[varName]).length > validator.maxLength) {
          errors.push(`${varName} exceeds maximum length of ${validator.maxLength}`);
        }
      }
    }

    // Check for unused variables
    const definedVars = template.variables || [];
    for (const varName of Object.keys(variables)) {
      if (!definedVars.includes(varName) && !varName.startsWith('_')) {
        warnings.push(`Variable "${varName}" is not defined in template`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Interpolate variables into template string
   */
  static _interpolate(template, variables, templateConfig) {
    if (!template) return '';

    let result = template;

    // Replace {{variableName}} with values
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${this._escapeRegex(key)}\\s*\\}\\}`, 'gi');
      const displayValue = value === null || value === undefined ? '' : String(value);
      result = result.replace(regex, templateConfig.auto_escape !== false ? this._escapeHtml(displayValue) : displayValue);
    }

    // Handle {{{variableName}}} for unescaped output
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\{\\s*${this._escapeRegex(key)}\\s*\\}\\}\\}`, 'gi');
      const displayValue = value === null || value === undefined ? '' : String(value);
      result = result.replace(regex, displayValue);
    }

    // Replace any remaining {{variables}} with empty string if strict mode off
    if (!templateConfig.strict_variables) {
      result = result.replace(/\{\{\{?\s*\w+\s*\}?\}\}/g, '');
    }

    return result.trim();
  }

  /**
   * Process conditional blocks in template
   * Supports: {{#if variable}}...{{/if}} and {{#unless variable}}...{{/unless}}
   */
  static _processConditionals(template, variables) {
    // {{#if variable}}content{{/if}}
    let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
      return variables[varName] ? content : '';
    });

    // {{#unless variable}}content{{/unless}}
    result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, varName, content) => {
      return !variables[varName] ? content : '';
    });

    return result;
  }

  /**
   * Record template usage for statistics
   */
  static async _recordUsage(templateId) {
    await require('@siamsiam/shared-utils').database.connectionPool.query(
      `UPDATE ${this.tableName} SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1`,
      [templateId]
    );
  }

  /**
   * Escape HTML special characters
   */
  static _escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Escape regex special characters
   */
  static _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = NotificationTemplate;
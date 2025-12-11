// OrderCo Configuration
// Centralized configuration for easy modification

// API Base URL - Change this to point to different backend environments
// Development: http://localhost:5000/api
// Production: https://your-production-domain.com/api
// Staging: https://staging-api.your-domain.com/api

const CONFIG = {
    // API Base URL
    //API_BASE_URL: 'http://localhost:5000/api',
    API_BASE_URL: 'http://orderco.runasp.net/api',
    // Admin Password (for local development only)
    // In production, this should be managed server-side
    ADMIN_PASSWORD: 'admin123',
    
    // Application Settings
    APP_NAME: 'OrderCo',
    APP_VERSION: '1.0.0',
    
    // Voting Settings (in minutes)
    DEFAULT_VOTING_TIME: 10,
    
    // UI Settings
    ENABLE_DEBUG: false,
    
    // Storage Keys for localStorage
    STORAGE_KEYS: {
        APPLICANT_ID: 'orderco_applicant_id',
        APPLICANT_NAME: 'orderco_applicant_name',
        IS_ADMIN: 'orderco_is_admin'
    }
};

// Export for use in other files
// Usage: CONFIG.API_BASE_URL, CONFIG.ADMIN_PASSWORD, etc.

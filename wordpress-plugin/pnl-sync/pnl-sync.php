<?php
/**
 * Plugin Name:  PNL Sync
 * Plugin URI:   https://github.com/your-repo/pnl-sync
 * Description:  Sync WooCommerce products & orders to PNL Dashboard — fast bulk export + real-time webhooks.
 * Version:      1.0.2
 * Author:       PNL Dashboard
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 9.0
 */

defined( 'ABSPATH' ) || exit;

define( 'PNL_SYNC_VERSION', '1.0.2' );
define( 'PNL_SYNC_FILE',    __FILE__ );
define( 'PNL_SYNC_DIR',     plugin_dir_path( __FILE__ ) );

// ── Autoload classes ─────────────────────────────────────────────────────────
require_once PNL_SYNC_DIR . 'includes/class-pnl-auth.php';
require_once PNL_SYNC_DIR . 'includes/class-pnl-product-api.php';
require_once PNL_SYNC_DIR . 'includes/class-pnl-order-api.php';
require_once PNL_SYNC_DIR . 'includes/class-pnl-webhook.php';
require_once PNL_SYNC_DIR . 'admin/class-pnl-settings.php';

// ── Boot ─────────────────────────────────────────────────────────────────────
add_action( 'rest_api_init', function () {
    $auth = new PNL_Auth();
    ( new PNL_Product_API( $auth ) )->register_routes(); // includes /status + /products
    ( new PNL_Order_API( $auth ) )->register_routes();   // includes /orders
} );

add_action( 'plugins_loaded', function () {
    // Only boot webhook & settings when WooCommerce is active
    if ( class_exists( 'WooCommerce' ) ) {
        new PNL_Webhook();
    }
    new PNL_Settings();
} );

// ── Activation: set default options ──────────────────────────────────────────
register_activation_hook( __FILE__, function () {
    if ( ! get_option( 'pnl_sync_secret' ) ) {
        // Auto-generate a random secret on first activation
        update_option( 'pnl_sync_secret', wp_generate_password( 32, false ) );
    }
} );

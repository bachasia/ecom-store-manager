<?php
defined( 'ABSPATH' ) || exit;

/**
 * Authentication helper — validates X-PNL-Secret header against stored token.
 * Uses hash_equals() to prevent timing attacks.
 */
class PNL_Auth {

    /**
     * WP REST API permission_callback — returns true or WP_Error.
     */
    public function permission_callback( WP_REST_Request $request ) {
        $stored = get_option( 'pnl_sync_secret', '' );

        if ( empty( $stored ) ) {
            return new WP_Error(
                'pnl_not_configured',
                'PNL Sync secret is not configured. Please go to Settings > PNL Sync.',
                array( 'status' => 503 )
            );
        }

        $provided = (string) $request->get_header( 'X-PNL-Secret' );

        if ( ! hash_equals( $stored, $provided ) ) {
            return new WP_Error(
                'pnl_unauthorized',
                'Invalid secret token.',
                array( 'status' => 401 )
            );
        }

        return true;
    }

    /**
     * Verify secret for outgoing webhook responses — same logic, different context.
     */
    public function get_secret(): string {
        return (string) get_option( 'pnl_sync_secret', '' );
    }
}

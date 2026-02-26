<?php
defined( 'ABSPATH' ) || exit;

/**
 * REST endpoint: GET /wp-json/pnl-sync/v1/orders
 *
 * Query params:
 *   page          int     default 1
 *   per_page      int     default 50, max 100
 *   modified_after string ISO 8601 — incremental sync
 *   status        string  comma-separated WC statuses, default all
 */
class PNL_Order_API {

    /** @var PNL_Auth */
    private $auth;

    public function __construct( PNL_Auth $auth ) {
        $this->auth = $auth;
    }

    public function register_routes() {
        register_rest_route( 'pnl-sync/v1', '/orders', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array( $this, 'get_orders' ),
            'permission_callback' => array( $this->auth, 'permission_callback' ),
            'args'                => array(
                'page'           => array( 'type' => 'integer', 'default' => 1, 'minimum' => 1 ),
                'per_page'       => array( 'type' => 'integer', 'default' => 50, 'minimum' => 1, 'maximum' => 100 ),
                'modified_after' => array( 'type' => 'string',  'default' => '' ),
                'status'         => array( 'type' => 'string',  'default' => 'any' ),
            ),
        ) );
    }

    public function get_orders( WP_REST_Request $request ) {
        try {
            $page           = max( 1, (int) $request->get_param( 'page' ) );
            $per_page       = min( 100, max( 1, (int) $request->get_param( 'per_page' ) ) );
            $modified_after = sanitize_text_field( $request->get_param( 'modified_after' ) );
            $status_param   = sanitize_text_field( $request->get_param( 'status' ) );

            // Build query args. Use paginate=true to avoid heavy second count query.
            $query_args = array(
                'limit'    => $per_page,
                'paged'    => $page,
                'orderby'  => 'date_modified',
                'order'    => 'DESC',
                'paginate' => true,
                'return'   => 'ids',
                // Only real orders. Exclude refund child records.
                'type'     => 'shop_order',
            );

            // Status filter
            if ( ! empty( $status_param ) && 'any' !== $status_param ) {
                $statuses = array_map( 'trim', explode( ',', $status_param ) );
                // WC_Order_Query expects statuses without `wc-` prefix
                $query_args['status'] = array_map( function( $s ) {
                    return preg_replace( '/^wc-/', '', $s );
                }, $statuses );
            } else {
                // All statuses (without wc- prefix)
                $query_args['status'] = array_map( function( $k ) {
                    return preg_replace( '/^wc-/', '', $k );
                }, array_keys( wc_get_order_statuses() ) );
            }

            // Date filter
            if ( ! empty( $modified_after ) ) {
                $ts = strtotime( $modified_after );
                if ( $ts ) {
                    // Use WC string format instead of unix timestamp for compatibility.
                    $query_args['date_modified'] = '>' . gmdate( 'Y-m-d H:i:s', $ts );
                }
            }

            $result = wc_get_orders( $query_args );
            $order_ids   = ( isset( $result->orders ) && is_array( $result->orders ) ) ? $result->orders : array();
            $total       = isset( $result->total ) ? (int) $result->total : count( $order_ids );
            $total_pages   = isset( $result->max_num_pages ) ? (int) $result->max_num_pages : (int) ceil( $total / $per_page );

            $orders = array();
            foreach ( $order_ids as $order_id ) {
                $order = wc_get_order( $order_id );
                if ( ! $order ) {
                    continue;
                }

                // Defensive guard: in some WooCommerce setups query may still include refund objects.
                if ( $order instanceof WC_Order_Refund ) {
                    continue;
                }
                if ( method_exists( $order, 'get_type' ) && 'shop_order_refund' === $order->get_type() ) {
                    continue;
                }
                if ( ! $order instanceof WC_Order ) {
                    continue;
                }

                $orders[] = $this->format_order( $order );
            }

            return new WP_REST_Response( array(
                'orders'      => $orders,
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $per_page,
                'total_pages' => $total_pages,
                'has_more'    => $page < $total_pages,
            ) );
        } catch ( Throwable $e ) {
            if ( function_exists( 'error_log' ) ) {
                error_log( '[PNL Sync][orders] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() );
            }

            return new WP_REST_Response( array(
                'code'    => 'pnl_orders_failed',
                'message' => $e->getMessage(),
                'file'    => basename( $e->getFile() ),
                'line'    => (int) $e->getLine(),
            ), 500 );
        }
    }

    // ── Format helpers ────────────────────────────────────────────────────────

    private function format_order( WC_Order $order ): array {
        $refund_total = 0;
        foreach ( $order->get_refunds() as $refund ) {
            $refund_total += abs( (float) $refund->get_amount() );
        }

        // Line items
        $line_items = array();
        foreach ( $order->get_items() as $item ) {
            /** @var WC_Order_Item_Product $item */
            $product    = $item->get_product();
            $product_id = $item->get_variation_id() ?: $item->get_product_id();

            $line_items[] = array(
                'id'           => $item->get_id(),
                'product_id'   => $item->get_product_id(),
                'variation_id' => $item->get_variation_id() ?: null,
                'name'         => $item->get_name(),
                'sku'          => $product ? $product->get_sku() : '',
                'quantity'     => $item->get_quantity(),
                'price'        => (float) ( $item->get_total() / max( 1, $item->get_quantity() ) ),
                'total'        => (float) $item->get_total(),
            );
        }

        // Shipping lines
        $shipping_total = 0;
        foreach ( $order->get_items( 'shipping' ) as $shipping ) {
            $shipping_total += (float) $shipping->get_total();
        }

        // Meta data (for attribution/UTM tracking)
        // Export broad-compatible keys across Woo core attribution + popular plugins.
        $meta_data = array();
        $meta_keys = array(
            'utm_source',
            '_utm_source',
            'utm_medium',
            '_utm_medium',
            'utm_campaign',
            '_utm_campaign',
            '_wc_order_attribution_utm_source',
            '_wc_order_attribution_utm_medium',
            '_wc_order_attribution_utm_campaign',
            '_wc_order_attribution_source_type',
            '_wc_order_attribution_referrer',
            '_wc_order_attribution_session_entry',
            '_wc_order_attribution_session_start_time',
            'source',
            '_source',
            'medium',
            '_medium',
            'campaign',
            '_campaign',
            'gclid',
            '_gclid',
            'fbclid',
            '_fbclid',
            'wbraid',
            '_wbraid',
            'gbraid',
            '_gbraid',
            'ttclid',
            '_ttclid',
            'msclkid',
            '_msclkid',
            'landing_site',
            '_landing_site',
            'landing_site_ref',
            '_landing_site_ref',
            'referring_site',
            '_referring_site',
        );

        foreach ( $meta_keys as $key ) {
            $value = $order->get_meta( $key );
            if ( $value !== '' && $value !== null ) {
                $meta_data[] = array( 'key' => $key, 'value' => $value );
            }
        }

        // Also include any dynamic meta key that contains utm/attribution/click-id terms.
        foreach ( $order->get_meta_data() as $meta ) {
            if ( ! method_exists( $meta, 'get_data' ) ) continue;
            $meta_item = $meta->get_data();
            $k = isset( $meta_item['key'] ) ? (string) $meta_item['key'] : '';
            $v = $meta_item['value'] ?? null;
            if ( '' === $k || null === $v || '' === (string) $v ) continue;

            $kl = strtolower( $k );
            $is_attr_key = false !== strpos( $kl, 'utm' )
                || false !== strpos( $kl, 'attribution' )
                || in_array( $kl, array( 'gclid', '_gclid', 'fbclid', '_fbclid', 'wbraid', '_wbraid', 'gbraid', '_gbraid', 'ttclid', '_ttclid', 'msclkid', '_msclkid' ), true );

            if ( ! $is_attr_key ) continue;

            $exists = false;
            foreach ( $meta_data as $existing ) {
                if ( isset( $existing['key'] ) && $existing['key'] === $k ) {
                    $exists = true;
                    break;
                }
            }
            if ( ! $exists ) {
                $meta_data[] = array( 'key' => $k, 'value' => $v );
            }
        }

        $subtotal = 0.0;
        foreach ( $order->get_items() as $item ) {
            $subtotal += (float) $item->get_subtotal();
        }

        return array(
            'id'                   => $order->get_id(),
            'number'               => $order->get_order_number(),
            'status'               => $order->get_status(),
            'date_created'         => $order->get_date_created()  ? $order->get_date_created()->date( 'c' )  : null,
            'date_modified'        => $order->get_date_modified() ? $order->get_date_modified()->date( 'c' ) : null,
            'total'                => $order->get_total(),
            'subtotal'             => (string) $subtotal,
            'discount_total'       => $order->get_discount_total(),
            'shipping_total'       => (string) $shipping_total,
            'total_tax'            => $order->get_total_tax(),
            'refund_total'         => $refund_total,
            'payment_method'       => $order->get_payment_method(),
            'payment_method_title' => $order->get_payment_method_title(),
            'customer_id'          => $order->get_customer_id(),
            'billing'              => array(
                'first_name' => $order->get_billing_first_name(),
                'last_name'  => $order->get_billing_last_name(),
                'email'      => $order->get_billing_email(),
                'address_1'  => $order->get_billing_address_1(),
                'address_2'  => $order->get_billing_address_2(),
                'city'       => $order->get_billing_city(),
                'state'      => $order->get_billing_state(),
                'postcode'   => $order->get_billing_postcode(),
                'country'    => $order->get_billing_country(),
            ),
            'shipping'             => array(
                'first_name' => $order->get_shipping_first_name(),
                'last_name'  => $order->get_shipping_last_name(),
                'address_1'  => $order->get_shipping_address_1(),
                'address_2'  => $order->get_shipping_address_2(),
                'city'       => $order->get_shipping_city(),
                'state'      => $order->get_shipping_state(),
                'postcode'   => $order->get_shipping_postcode(),
                'country'    => $order->get_shipping_country(),
            ),
            'line_items'           => $line_items,
            'meta_data'            => $meta_data,
        );
    }
}

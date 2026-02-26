<?php
defined( 'ABSPATH' ) || exit;

/**
 * Outgoing webhooks — pushes product/order changes to PNL Dashboard in real-time.
 *
 * Uses wp_remote_post with blocking=false (fire-and-forget) to avoid
 * adding any latency to WooCommerce operations.
 */
class PNL_Webhook {

    public function __construct() {
        // ── Products ──────────────────────────────────────────────────────────
        add_action( 'woocommerce_new_product',              array( $this, 'on_product_save' ), 20, 1 );
        add_action( 'woocommerce_update_product',           array( $this, 'on_product_save' ), 20, 1 );
        add_action( 'woocommerce_delete_product',           array( $this, 'on_product_delete' ), 20, 1 );
        add_action( 'woocommerce_new_product_variation',    array( $this, 'on_variation_save' ), 20, 1 );
        add_action( 'woocommerce_update_product_variation', array( $this, 'on_variation_save' ), 20, 1 );

        // ── Orders ────────────────────────────────────────────────────────────
        // New order from checkout
        add_action( 'woocommerce_checkout_order_created',   array( $this, 'on_order_save' ), 20, 1 );
        // Status change (any transition)
        add_action( 'woocommerce_order_status_changed',     array( $this, 'on_order_status_changed' ), 20, 3 );
        // Order updated in admin
        add_action( 'woocommerce_update_order',             array( $this, 'on_order_save' ), 20, 1 );
        // Refund created
        add_action( 'woocommerce_order_refunded',           array( $this, 'on_order_refunded' ), 20, 2 );
    }

    // ── Product hooks ─────────────────────────────────────────────────────────

    public function on_product_save( $product_id ): void {
        $webhook_url = $this->get_webhook_url();
        if ( ! $webhook_url ) return;

        $product = wc_get_product( $product_id );
        if ( ! $product ) return;

        // Don't push variations directly — they'll be included in parent
        if ( $product->is_type( 'variation' ) ) return;

        $product_api = new PNL_Product_API( new PNL_Auth() );

        $this->push( $webhook_url . '/products', 'product.updated', array(
            'product' => $product_api->format_product( $product ),
        ) );
    }

    public function on_product_delete( $product_id ): void {
        $webhook_url = $this->get_webhook_url();
        if ( ! $webhook_url ) return;

        $this->push( $webhook_url . '/products', 'product.deleted', array(
            'product_id' => (int) $product_id,
        ) );
    }

    public function on_variation_save( $variation_id ): void {
        $webhook_url = $this->get_webhook_url();
        if ( ! $webhook_url ) return;

        $variation = wc_get_product( $variation_id );
        if ( ! $variation instanceof WC_Product_Variation ) return;

        // Push parent product (with all variations inline)
        $parent_id = $variation->get_parent_id();
        if ( $parent_id ) {
            $this->on_product_save( $parent_id );
        }
    }

    // ── Order hooks ───────────────────────────────────────────────────────────

    public function on_order_save( $order_or_id ): void {
        $webhook_url = $this->get_webhook_url();
        if ( ! $webhook_url ) return;

        $order_id = is_object( $order_or_id ) ? $order_or_id->get_id() : (int) $order_or_id;
        $order    = wc_get_order( $order_id );
        if ( ! $order ) return;

        $order_api = new PNL_Order_API( new PNL_Auth() );
        // Use reflection to call private method, or make it public
        $formatted = $this->format_order_for_webhook( $order );

        $this->push( $webhook_url . '/orders', 'order.updated', array(
            'order' => $formatted,
        ) );
    }

    public function on_order_status_changed( $order_id, $old_status, $new_status ): void {
        $this->on_order_save( $order_id );
    }

    public function on_order_refunded( $order_id, $refund_id ): void {
        $this->on_order_save( $order_id );
    }

    // ── Push helper ───────────────────────────────────────────────────────────

    private function push( string $url, string $event, array $payload ): void {
        $secret = ( new PNL_Auth() )->get_secret();
        if ( ! $secret ) return;

        wp_remote_post( $url, array(
            'method'   => 'POST',
            'headers'  => array(
                'Content-Type' => 'application/json',
                'X-PNL-Secret' => $secret,
                'X-PNL-Event'  => $event,
            ),
            'body'     => wp_json_encode( $payload ),
            'timeout'  => 5,
            'blocking' => false,  // Fire-and-forget: không làm chậm WooCommerce
        ) );
    }

    private function get_webhook_url(): ?string {
        $url = get_option( 'pnl_sync_webhook_url', '' );
        return ! empty( $url ) ? rtrim( $url, '/' ) : null;
    }

    // ── Format order (duplicated from Order API for webhook use) ─────────────

    private function format_order_for_webhook( WC_Order $order ): array {
        $refund_total = 0;
        foreach ( $order->get_refunds() as $refund ) {
            $refund_total += abs( (float) $refund->get_amount() );
        }

        $line_items = array();
        foreach ( $order->get_items() as $item ) {
            $product      = $item->get_product();
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

        $shipping_total = 0;
        foreach ( $order->get_items( 'shipping' ) as $shipping ) {
            $shipping_total += (float) $shipping->get_total();
        }

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

        return array(
            'id'                   => $order->get_id(),
            'number'               => $order->get_order_number(),
            'status'               => $order->get_status(),
            'date_created'         => $order->get_date_created()  ? $order->get_date_created()->date( 'c' )  : null,
            'date_modified'        => $order->get_date_modified() ? $order->get_date_modified()->date( 'c' ) : null,
            'total'                => $order->get_total(),
            'subtotal'             => (string) $order->get_subtotal(),
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
                'country'    => $order->get_billing_country(),
            ),
            'shipping'             => array(
                'country' => $order->get_shipping_country(),
            ),
            'line_items'           => $line_items,
            'meta_data'            => $meta_data,
        );
    }
}

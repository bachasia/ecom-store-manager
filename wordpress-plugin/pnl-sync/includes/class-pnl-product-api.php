<?php
defined( 'ABSPATH' ) || exit;

/**
 * REST endpoint: POST /wp-json/pnl-sync/v1/products
 *
 * Returns products with inline variations — 1 request covers everything,
 * no need for separate variation API calls.
 *
 * Query params:
 *   page          int   default 1
 *   per_page      int   default 200, max 500
 *   modified_after string  ISO 8601 — incremental sync
 */
class PNL_Product_API {

    /** @var PNL_Auth */
    private $auth;

    public function __construct( PNL_Auth $auth ) {
        $this->auth = $auth;
    }

    public function register_routes() {
        register_rest_route( 'pnl-sync/v1', '/products', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array( $this, 'get_products' ),
            'permission_callback' => array( $this->auth, 'permission_callback' ),
            'args'                => array(
                'page'           => array( 'type' => 'integer', 'default' => 1, 'minimum' => 1 ),
                'per_page'       => array( 'type' => 'integer', 'default' => 200, 'minimum' => 1, 'maximum' => 500 ),
                'modified_after' => array( 'type' => 'string', 'default' => '' ),
            ),
        ) );

        // Status / health check — kết hợp kiểm tra kết nối
        register_rest_route( 'pnl-sync/v1', '/status', array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => array( $this, 'get_status' ),
            'permission_callback' => array( $this->auth, 'permission_callback' ),
        ) );
    }

    // ── GET /pnl-sync/v1/status ───────────────────────────────────────────────

    public function get_status( WP_REST_Request $request ) {
        global $wpdb;

        $product_count = (int) $wpdb->get_var(
            "SELECT COUNT(ID) FROM {$wpdb->posts}
             WHERE post_type = 'product' AND post_status = 'publish'"
        );

        $order_count = (int) $wpdb->get_var(
            "SELECT COUNT(ID) FROM {$wpdb->posts}
             WHERE post_type IN ('shop_order','woocommerce_order_placeholder')
               AND post_status NOT IN ('auto-draft','trash')"
        );

        return new WP_REST_Response( array(
            'status'         => 'ok',
            'plugin_version' => PNL_SYNC_VERSION,
            'wc_version'     => defined( 'WC_VERSION' ) ? WC_VERSION : null,
            'product_count'  => $product_count,
            'order_count'    => $order_count,
            'site_url'       => get_site_url(),
        ) );
    }

    // ── GET /pnl-sync/v1/products ─────────────────────────────────────────────

    public function get_products( WP_REST_Request $request ) {
        global $wpdb;

        $page           = max( 1, (int) $request->get_param( 'page' ) );
        $per_page       = min( 500, max( 1, (int) $request->get_param( 'per_page' ) ) );
        $offset         = ( $page - 1 ) * $per_page;
        $modified_after = sanitize_text_field( $request->get_param( 'modified_after' ) );

        // ── Build WHERE ───────────────────────────────────────────────────────
        $where_parts = array(
            "p.post_type   = 'product'",
            "p.post_status = 'publish'",
        );

        $prepare_args = array();

        if ( ! empty( $modified_after ) ) {
            // Convert ISO 8601 to MySQL datetime (UTC)
            $dt = date_create( $modified_after );
            if ( $dt ) {
                $where_parts[]  = 'p.post_modified_gmt > %s';
                $prepare_args[] = $dt->format( 'Y-m-d H:i:s' );
            }
        }

        $where_sql = implode( ' AND ', $where_parts );

        // ── Count total ───────────────────────────────────────────────────────
        $count_sql = "SELECT COUNT(DISTINCT p.ID)
                      FROM {$wpdb->posts} p
                      WHERE {$where_sql}";

        $total = (int) ( empty( $prepare_args )
            ? $wpdb->get_var( $count_sql )
            : $wpdb->get_var( $wpdb->prepare( $count_sql, ...$prepare_args ) )
        );

        // ── Fetch product IDs (paginated) ─────────────────────────────────────
        $ids_sql = "SELECT DISTINCT p.ID
                    FROM {$wpdb->posts} p
                    WHERE {$where_sql}
                    ORDER BY p.post_modified_gmt DESC
                    LIMIT %d OFFSET %d";

        $ids_args = array_merge( $prepare_args, array( $per_page, $offset ) );
        $product_ids = $wpdb->get_col( $wpdb->prepare( $ids_sql, ...$ids_args ) );

        if ( empty( $product_ids ) ) {
            return new WP_REST_Response( array(
                'products'    => array(),
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $per_page,
                'total_pages' => (int) ceil( $total / $per_page ),
                'has_more'    => false,
            ) );
        }

        // ── Format each product ───────────────────────────────────────────────
        $products = array();
        foreach ( $product_ids as $product_id ) {
            $product = wc_get_product( $product_id );
            if ( ! $product ) {
                continue;
            }
            $products[] = $this->format_product( $product );
        }

        return new WP_REST_Response( array(
            'products'    => $products,
            'total'       => $total,
            'page'        => $page,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil( $total / $per_page ),
            'has_more'    => ( $page * $per_page ) < $total,
        ) );
    }

    // ── Format helpers ────────────────────────────────────────────────────────

    /**
     * Format a WC_Product into the PNL sync payload.
     * Variable products include all variations inline — no extra API calls needed.
     */
    public function format_product( WC_Product $product ): array {
        $image_id  = $product->get_image_id();
        $image_url = $image_id ? wp_get_attachment_url( $image_id ) : null;

        $data = array(
            'id'         => $product->get_id(),
            'name'       => $product->get_name(),
            'type'       => $product->get_type(),   // simple | variable | grouped | external
            'sku'        => $product->get_sku(),
            'price'      => $product->get_price(),
            'image_url'  => $image_url ?: null,
            'modified'   => $product->get_date_modified() ? $product->get_date_modified()->date( 'c' ) : null,
            'variations' => array(),
        );

        // Inline all variations — saves N extra API calls on pnl-dashboard side
        if ( $product->is_type( 'variable' ) ) {
            /** @var WC_Product_Variable $product */
            $variation_ids = $product->get_children();

            foreach ( $variation_ids as $variation_id ) {
                $variation = wc_get_product( $variation_id );
                if ( ! $variation instanceof WC_Product_Variation ) {
                    continue;
                }
                if ( 'publish' !== $variation->get_status() ) {
                    continue;
                }

                $var_image_id  = $variation->get_image_id();
                $var_image_url = $var_image_id ? wp_get_attachment_url( $var_image_id ) : null;

                // Build flat attributes array: [['name'=>..., 'option'=>...], ...]
                $attributes = array();
                foreach ( $variation->get_variation_attributes() as $attr_name => $attr_value ) {
                    // attr_name is like 'attribute_pa_color' or 'attribute_Size'
                    $clean_name = wc_attribute_label( str_replace( 'attribute_', '', $attr_name ) );
                    $attributes[] = array(
                        'name'   => $clean_name,
                        'option' => $attr_value,
                    );
                }

                $data['variations'][] = array(
                    'id'         => $variation->get_id(),
                    'sku'        => $variation->get_sku(),
                    'price'      => $variation->get_price(),
                    'attributes' => $attributes,
                    'image_url'  => $var_image_url ?: $image_url,  // fallback to parent image
                );
            }
        }

        return $data;
    }
}

<?php
defined( 'ABSPATH' ) || exit;

/**
 * Admin Settings Page — Settings > PNL Sync
 *
 * Options stored:
 *   pnl_sync_secret      string  Shared secret token (auto-generated on activation)
 *   pnl_sync_webhook_url string  URL of pnl-dashboard webhook endpoint
 */
class PNL_Settings {

    public function __construct() {
        add_action( 'admin_menu', array( $this, 'add_menu' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );
    }

    public function add_menu(): void {
        add_options_page(
            'PNL Sync',
            'PNL Sync',
            'manage_options',
            'pnl-sync',
            array( $this, 'render_page' )
        );
    }

    public function register_settings(): void {
        register_setting( 'pnl_sync_settings', 'pnl_sync_secret',      array( 'sanitize_callback' => 'sanitize_text_field' ) );
        register_setting( 'pnl_sync_settings', 'pnl_sync_webhook_url', array( 'sanitize_callback' => 'esc_url_raw' ) );
    }

    public function render_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $secret      = get_option( 'pnl_sync_secret', '' );
        $webhook_url = get_option( 'pnl_sync_webhook_url', '' );
        $saved       = isset( $_GET['settings-updated'] ) && $_GET['settings-updated'];

        // Regenerate secret action
        if ( isset( $_POST['pnl_regenerate_secret'] ) && check_admin_referer( 'pnl_regenerate' ) ) {
            $new_secret = wp_generate_password( 32, false );
            update_option( 'pnl_sync_secret', $new_secret );
            $secret  = $new_secret;
            $message = 'Secret token đã được tạo mới.';
        }

        $rest_base = get_rest_url( null, 'pnl-sync/v1' );
        ?>
        <div class="wrap">
            <h1>PNL Sync Settings</h1>

            <?php if ( $saved ): ?>
                <div class="notice notice-success is-dismissible"><p>Đã lưu cài đặt.</p></div>
            <?php endif; ?>

            <?php if ( isset( $message ) ): ?>
                <div class="notice notice-warning is-dismissible"><p><?php echo esc_html( $message ); ?></p></div>
            <?php endif; ?>

            <?php if ( ! class_exists( 'WooCommerce' ) ): ?>
                <div class="notice notice-error"><p><strong>WooCommerce chưa được kích hoạt.</strong> Plugin PNL Sync cần WooCommerce.</p></div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields( 'pnl_sync_settings' ); ?>

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label>Secret Token</label></th>
                        <td>
                            <code style="font-size:14px; background:#f0f0f1; padding:6px 10px; border-radius:4px; user-select:all;">
                                <?php echo esc_html( $secret ); ?>
                            </code>
                            <p class="description">
                                Copy token này vào trang quản lý PNL Dashboard khi thêm store.
                            </p>
                            <input type="hidden" name="pnl_sync_secret" value="<?php echo esc_attr( $secret ); ?>" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pnl_sync_webhook_url">Webhook URL</label></th>
                        <td>
                            <input type="url"
                                   name="pnl_sync_webhook_url"
                                   id="pnl_sync_webhook_url"
                                   value="<?php echo esc_attr( $webhook_url ); ?>"
                                   class="regular-text"
                                   placeholder="https://your-pnl-dashboard.com/api/webhooks/wc-plugin/STORE_ID" />
                            <p class="description">
                                URL nhận push events (product/order changes) từ plugin.<br>
                                Định dạng: <code>https://[your-pnl-domain]/api/webhooks/wc-plugin/[storeId]</code>
                            </p>
                        </td>
                    </tr>
                </table>

                <?php submit_button( 'Lưu cài đặt' ); ?>
            </form>

            <!-- Regenerate secret -->
            <hr>
            <h2>Tạo lại Secret Token</h2>
            <p>Nếu bạn muốn thay đổi secret token, nhấn nút bên dưới. <strong>Lưu ý:</strong> bạn sẽ cần cập nhật lại token trong PNL Dashboard.</p>
            <form method="post">
                <?php wp_nonce_field( 'pnl_regenerate' ); ?>
                <input type="submit" name="pnl_regenerate_secret" class="button button-secondary" value="Tạo lại Secret Token" />
            </form>

            <!-- API Endpoints info -->
            <hr>
            <h2>API Endpoints</h2>
            <p>Các endpoints sau được plugin cung cấp (yêu cầu header <code>X-PNL-Secret</code>):</p>
            <table class="widefat striped" style="max-width:700px;">
                <thead><tr><th>Endpoint</th><th>Mục đích</th></tr></thead>
                <tbody>
                    <tr>
                        <td><code><?php echo esc_html( $rest_base ); ?>/status</code></td>
                        <td>Kiểm tra kết nối, thống kê cơ bản</td>
                    </tr>
                    <tr>
                        <td><code><?php echo esc_html( $rest_base ); ?>/products?page=1&per_page=200</code></td>
                        <td>Bulk export sản phẩm (kèm variations)</td>
                    </tr>
                    <tr>
                        <td><code><?php echo esc_html( $rest_base ); ?>/orders?page=1&per_page=200</code></td>
                        <td>Bulk export đơn hàng</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <?php
    }
}

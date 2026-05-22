package io.nexalink.app

import android.app.Application
import io.nexalink.app.data.NexaLinkDatabase
import io.nexalink.app.network.MatrixApi
import io.nexalink.app.util.SecurePrefs

/**
 * NexaLink Application — initializes core components.
 * All data stored in app's private directory (auto-deleted on uninstall).
 */
class NexaLinkApp : Application() {

    lateinit var database: NexaLinkDatabase
        private set
    lateinit var matrixApi: MatrixApi
        private set
    lateinit var securePrefs: SecurePrefs
        private set
    lateinit var e2ee: io.nexalink.app.network.E2EEncryption
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        securePrefs = SecurePrefs(this)
        database = NexaLinkDatabase.create(this)

        val serverUrl = securePrefs.serverUrl ?: BuildConfig.SERVER_URL
        matrixApi = MatrixApi(serverUrl)

        // Initialize E2E encryption
        e2ee = io.nexalink.app.network.E2EEncryption(securePrefs)
        e2ee.init()
    }

    companion object {
        lateinit var instance: NexaLinkApp
            private set
    }
}

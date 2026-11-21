plugins {
    id("com.android.application")
}

android {
    namespace = "com.deepseekclone.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.deepseekclone.app"
        minSdk = 26
        // targetSdk 34：避免 Android 15 强制边到边导致 WebView 顶栏压到状态栏
        targetSdk = 34
        versionCode = 7
        versionName = "0.1.7"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

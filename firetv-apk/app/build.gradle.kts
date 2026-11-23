plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.igc.cuidadoninos.tv"
    compileSdk = 34

    defaultConfig {
        val ciVersionCode = (project.findProperty("APP_VERSION_CODE") as String?)?.toIntOrNull() ?: 1
        applicationId = "org.igc.cuidadoninos.tv"
        minSdk = 24
        targetSdk = 34
        versionCode = ciVersionCode
        versionName = "1.0.$ciVersionCode"
    }

    signingConfigs {
        val ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
        val ksPass = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        val ksAlias = System.getenv("ANDROID_KEY_ALIAS")
        val keyPass = System.getenv("ANDROID_KEY_PASSWORD")
        if (!ksPath.isNullOrBlank() && !ksPass.isNullOrBlank() && !ksAlias.isNullOrBlank() && !keyPass.isNullOrBlank()) {
            create("release") {
                storeFile = file(ksPath)
                storePassword = ksPass
                keyAlias = ksAlias
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            val releaseSigning = signingConfigs.findByName("release")
            if (releaseSigning != null) {
                signingConfig = releaseSigning
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}

import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing config lives in android/keystore.properties (gitignored).
// If the file is missing, release builds fall back to the debug key so local
// builds never break; generate the keystore once and add the properties file.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}

android {
    namespace = "com.fsf.somiti"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fsf.somiti"
        minSdk = 24
        targetSdk = 35
        versionCode = 4
        versionName = "1.2.0"

        // The web app this shell wraps. Override with:
        //   gradle assembleRelease -PSERVER_URL=https://your-deployment.vercel.app
        val defaultServer = (project.findProperty("SERVER_URL") as String?) ?: ""
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$defaultServer\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
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
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
}

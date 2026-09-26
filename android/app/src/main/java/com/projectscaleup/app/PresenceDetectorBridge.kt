package com.projectscaleup.app

import android.graphics.BitmapFactory
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker

class PresenceDetectorBridge(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "PresenceDetectorBridge"

  private var faceDetector: FaceDetector? = null
  private var poseLandmarker: PoseLandmarker? = null

  @ReactMethod
  fun loadFaceModel(promise: Promise) {
    try {
      if (faceDetector == null) {
        val options =
          FaceDetector.FaceDetectorOptions.builder()
            .setBaseOptions(
              BaseOptions.builder()
                .setModelAssetPath("face_detector.tflite")
                .build(),
            )
            .setRunningMode(RunningMode.IMAGE)
            .build()

        faceDetector = FaceDetector.createFromOptions(reactApplicationContext, options)
      }

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("presence_face_model_load_failed", error)
    }
  }

  @ReactMethod
  fun loadPoseModel(promise: Promise) {
    try {
      val options =
        PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(
            BaseOptions.builder()
              .setModelAssetPath("pose_landmarker_lite.task")
              .build(),
          )
          .setRunningMode(RunningMode.IMAGE)
          .build()

      poseLandmarker = PoseLandmarker.createFromOptions(reactApplicationContext, options)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("presence_pose_model_load_failed", error)
    }
  }

  @ReactMethod
  fun unloadPoseModel(promise: Promise) {
    poseLandmarker?.close()
    poseLandmarker = null
    promise.resolve(null)
  }

  @ReactMethod
  fun detectFace(base64Image: String, promise: Promise) {
    try {
      val bitmap = decodeBitmap(base64Image)
      val mpImage = BitmapImageBuilder(bitmap).build()
      val result = faceDetector?.detect(mpImage)
      val detections = result?.detections()
      val map = Arguments.createMap()

      if (detections.isNullOrEmpty()) {
        map.putBoolean("presenceDetected", false)
        map.putNull("faceWidthPercent")
        map.putNull("faceHorizontalOffset")
      } else {
        val box = detections[0].boundingBox()
        val widthPercent = (box.width() / bitmap.width.toFloat()) * 100
        val centerX = box.centerX() / bitmap.width.toFloat()
        val horizontalOffset = (centerX - 0.5f) * 100

        map.putBoolean("presenceDetected", true)
        map.putDouble("faceWidthPercent", widthPercent.toDouble())
        map.putDouble("faceHorizontalOffset", horizontalOffset.toDouble())
      }

      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("presence_face_detection_failed", error)
    }
  }

  @ReactMethod
  fun detectPose(base64Image: String, promise: Promise) {
    try {
      val bitmap = decodeBitmap(base64Image)
      val mpImage = BitmapImageBuilder(bitmap).build()
      val result = poseLandmarker?.detect(mpImage)
      val map = Arguments.createMap()

      map.putBoolean("presenceDetected", !result?.landmarks().isNullOrEmpty())
      map.putNull("faceWidthPercent")
      map.putNull("faceHorizontalOffset")

      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("presence_pose_detection_failed", error)
    }
  }

  private fun decodeBitmap(base64Image: String) =
    Base64.decode(base64Image, Base64.DEFAULT).let { bytes ->
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }
}

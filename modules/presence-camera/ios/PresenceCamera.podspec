Pod::Spec.new do |s|
  s.name           = 'PresenceCamera'
  s.version        = '1.0.0'
  s.summary        = 'Front-camera preview with on-device presence detection (Vision) for Project ScaleUp.'
  s.homepage       = 'https://github.com/projectkinda/projectscaelup'
  s.license        = { :type => 'MIT' }
  s.author         = 'Project ScaleUp'
  s.platforms      = { :ios => '18.0' }
  # Matches Expo's own modules: the module DSL predates Swift 6 isolation checking.
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/projectkinda/projectscaelup.git' }
  s.static_framework = true
  s.source_files   = '**/*.swift'
  s.frameworks     = 'AVFoundation', 'Vision'
  s.dependency 'ExpoModulesCore'
end

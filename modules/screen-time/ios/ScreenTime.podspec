Pod::Spec.new do |s|
  s.name           = 'ScreenTime'
  s.version        = '1.0.0'
  s.summary        = 'JavaScript bridge to Project ScaleUp Screen Time (FamilyControls, DeviceActivity, ManagedSettings).'
  s.homepage       = 'https://github.com/projectkinda/projectscaelup'
  s.license        = { :type => 'MIT' }
  s.author         = 'Project ScaleUp'
  s.platforms      = { :ios => '18.0' }
  # Matches Expo's own modules: the module DSL predates Swift 6 isolation checking.
  # All Screen Time logic lives in ScreenTimeCore, which builds in Swift 6 mode.
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/projectkinda/projectscaelup.git' }
  s.static_framework = true
  s.source_files   = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'ScreenTimeCore'
end

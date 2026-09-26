Pod::Spec.new do |s|
  s.name           = 'ScreenTimeCore'
  s.version        = '1.0.0'
  s.summary        = 'Screen Time state, rules and shielding shared by Project ScaleUp and its extensions.'
  s.homepage       = 'https://github.com/projectkinda/projectscaelup'
  s.license        = { :type => 'MIT' }
  s.author         = 'Project ScaleUp'
  s.platforms      = { :ios => '18.0' }
  s.swift_version  = '6.0'
  s.source         = { :git => 'https://github.com/projectkinda/projectscaelup.git' }
  s.source_files   = 'Sources/**/*.swift'
  s.frameworks     = 'DeviceActivity', 'FamilyControls', 'ManagedSettings'
  # Linked into app extensions, so it must only use extension-safe APIs.
  s.pod_target_xcconfig = { 'APPLICATION_EXTENSION_API_ONLY' => 'YES' }
end

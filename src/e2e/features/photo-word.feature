Feature: 拍照学单词 (AI-606)
  孩子拍照/上传图片，AI 识别物体并返回单词卡片，可一键加入个人生词本。

  Scenario: 上传图片识别单词并加入生词本
    Given I am logged in as a new user
    When I open the photo-word page
    And I upload a test image
    And I click the scan button
    Then I should see at least 1 recognized word card
    When I click add all to vocab book
    Then my vocab book should contain a recognized word

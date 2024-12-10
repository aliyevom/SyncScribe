pipeline {
  agent any
  stages {
    stage('Install Packages') {
      steps {
        echo 'Installing npm packages for backend...'
        sh 'npm install'
      }
    }

    stage('Backend Artifact package') {
      steps {
        echo 'Packaging backend...'
        sh 'npm pack'
        archiveArtifacts artifacts: 'meeting-transcriber-*.tgz', onlyIfSuccessful: true
      }
    }

    stage('Frontend UI') {
      parallel {
        stage('Frontend UI Installation') {
          steps {
            echo 'Cloning and installing frontend...'
            sh '''
              git clone https://github.com/aliyevom/Sync-client.git client
              cd client
              npm install
            '''
          }
        }

        stage('UI Artifact Package') {
          steps {
            echo 'Packaging frontend...'
            sh '''
              cd client
              npm pack
            '''
            echo 'Listing artifacts...'
            sh '''
              cd client
              ls -la
            '''
            archiveArtifacts artifacts: 'client/client-*.tgz', onlyIfSuccessful: true
          }
        }
      }
    }
  }
  tools {
    maven 'Maven 3.9.6'
    nodejs 'NodeJS 23.x'
  }
  post {
    always {
      echo 'Pipeline execution completed.'
    }
    success {
      echo 'Build succeeded!'
    }
    failure {
      echo 'Build failed. Please check the logs.'
    }
  }
}

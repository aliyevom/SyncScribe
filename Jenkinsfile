pipeline {
  agent any
  stages {
    stage('Install Packages') {
      steps {
        echo 'Installing npm packages...'
        sh 'npm install'
      }
    }

    stage('Package testing') {
      steps {
        sh '''ls -la
'''
        sh 'npm test'
      }
    }

    stage('Artifact package') {
      steps {
        sh '''npm pack
'''
        archiveArtifacts 'meeting-transcriber-*.tgz'
      }
    }

    stage('Frontend UI') {
      parallel {
        stage('Frontend UI') {
          steps {
            sh '''cd client
git clone https://github.com/aliyevom/Sync-client.git .
npm install'''
          }
        }

        stage('Artifact package') {
          steps {
            sh 'npm pack'
            archiveArtifacts 'client-*.tgz'
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
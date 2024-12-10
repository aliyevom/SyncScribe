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
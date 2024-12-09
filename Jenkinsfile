pipeline {
    agent any
    tools {
        maven 'Maven 3.9.6'
    }
    stages {
        stage("Server install package") {
            steps {
                echo 'Installing package in Sync!'
                sh 'npm install'
            }
        }
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

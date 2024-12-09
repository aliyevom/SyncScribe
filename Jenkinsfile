pipeline {
    agent any
    tools {
        maven 'Maven 3.9.6' 
        nodejs 'NodeJS 23.x'
    }
    stages {
        stage("Install Packages") {
            steps {
                echo 'Installing npm packages...'
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

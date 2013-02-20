var learnername = ""; // Nome do aluno
var completed = false; // Status da AI: completada ou não
var score = 0; // Nota do aluno (de 0 a 100)
var scormExercise = 1; // Exercício corrente relevante ao SCORM
var screenExercise = 1; // Exercício atualmente visto pelo aluno (não tem relação com scormExercise)
var N_EXERCISES = 2; // Quantidade de exercícios desta AI
var scorm = pipwerks.SCORM; // Seção SCORM
scorm.version = "2004"; // Versão da API SCORM
var PING_INTERVAL = 5 * 60 * 1000; // milissegundos
var pingCount = 0;  // Conta a quantidade de pings enviados para o LMS
var MAX_INIT_TRIES = 60;
var init_tries = 0;
var debug = true;

// Inicia a AI.
$(document).ready(function(){
	tryinitialize();
  
});

function tryinitialize(){
	try{
		document.ggbApplet.debug("");
		initialize();
	}catch(err){
		setTimeout(tryinitialize, 1000);
	}
}

function initialize(){
	//Deixa a aba "Orientações" ativa no carregamento da atividade
  $('#exercicios').tabs({ selected: 0 });
  
  $('#exercicios').tabs({
      select: function(event, ui) {

	if (ui.index == 1) {
		screenExercise = ui.index;
	}
	else if (ui.index == 2) {
		screenExercise = ui.index;

	        var dx = document.ggbApplet.getXCoord('r');
         	var dy = document.ggbApplet.getYCoord('r');
		var modulo = Math.sqrt(dx * dx + dy * dy);
          
		$('#modulo_r').html(modulo.toFixed(1).replace('.',','));
	}

      }
  });
  
  $('#button1').button().click(evaluateExercise);
  $('#button2').button().click(evaluateExercise);
  $('#button3').button().click(reloadPage);
  
  $('#exercicios').show();
  
  checkCallbacks();
}

function checkCallbacks () {
	var t2 = new Date().getTime();
	var ok = false;
	try {
			// Sorteia as coordenadas do ponto C
		var xcoord = -3 + Math.floor(9 * Math.random());
		var ycoord = -1 + Math.floor(5 * Math.random());
		if (xcoord == 0 && ycoord == 0) ycoord = 1; // Só para não dar um vetor (0,0)
		document.ggbApplet.setCoords('R2', xcoord, ycoord);
		ok = true;
		message("ok");
	}
	catch(error) {
		++init_tries;
		
		if (init_tries > MAX_INIT_TRIES) {
			alert("Carregamento falhou.");
		}
		else {
			message("falhou");
			setTimeout("checkCallbacks()", 1000);
		}
	}
	
	if(ok) initAI();
}

//Refresh da Página.
function reloadPage()
{
	document.getElementById("limpa").reset();
	window.location.reload() 
}

// Encerra a AI.
$(window).unload(function (){
  if (!completed) {
    save2LMS();
    scorm.quit();
  }
});

/*
 * Inicia a AI.
 */ 
function initAI () {
 
  // Conecta-se ao LMS
  var connected = scorm.init();
  
  // A tentativa de conexão com o LMS foi bem sucedida.
  if (connected) {
  
    // Verifica se a AI já foi concluída.
    var completionstatus = scorm.get("cmi.completion_status");
    
    // A AI já foi concluída.
    switch (completionstatus) {
    
      // Primeiro acesso à AI
      case "not attempted":
      case "unknown":
      default:
        completed = false;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = 1;
        score = 0;
        
        $("#completion-message").removeClass().addClass("completion-message-off");             
        break;
        
      // Continuando a AI...
      case "incomplete":
        completed = false;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = parseInt(scorm.get("cmi.location"));
        score = parseInt(scorm.get("cmi.score.raw"));
        
        $("#completion-message").removeClass().addClass("completion-message-off");        
        break;
        
      // A AI já foi completada.
      case "completed":
        completed = true;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = parseInt(scorm.get("cmi.location"));
        score = parseInt(scorm.get("cmi.score.raw"));
        
        $("#completion-message").removeClass().addClass("completion-message-on");
        break;
    }
    
    if (isNaN(scormExercise)) scormExercise = 1;
    if (isNaN(score)) score = 0;
    
    // Posiciona o aluno no exercício da vez
    screenExercise = scormExercise;
    $('#exercicios').tabs("select", scormExercise);
    
    pingLMS();
  }
  // A tentativa de conexão com o LMS falhou.
  else {
    completed = false;
    learnername = "";
    scormExercise = 1;
    score = 0;
    log.error("A conexão com o Moodle falhou.");
  }
  
  // (Re)abilita os exercícios já feitos e desabilita aqueles ainda por fazer.
  if (completed) $('#exercicios').tabs("option", "disabled", []);
  else {
	$('#exercicios').tabs((scormExercise >= 1 ? "enable": "disable"), 1);
	$('#exercicios').tabs((scormExercise >= 2 ? "enable": "disable"), 2);
  }
}

/*
 * Salva cmi.score.raw, cmi.location e cmi.completion_status no LMS
 */ 
function save2LMS () {
  if (scorm.connection.isActive) {
  
    // Salva no LMS a nota do aluno.
    var success = scorm.set("cmi.score.raw", score);
  
    // Notifica o LMS que esta atividade foi concluída.
    success = scorm.set("cmi.completion_status", (completed ? "completed" : "incomplete"));
    
    // Salva no LMS o exercício que deve ser exibido quando a AI for acessada novamente.
    success = scorm.set("cmi.location", scormExercise);
    
    if (!success) log.error("Falha ao enviar dados para o LMS.");
  }
  else {
    log.trace("A conexão com o LMS não está ativa.");
  }
}

/*
 * Mantém a conexão com LMS ativa, atualizando a variável cmi.session_time
 */
function pingLMS () {

	scorm.get("cmi.completion_status");
	var timer = setTimeout("pingLMS()", PING_INTERVAL);
}

/*
 * Avalia a resposta do aluno ao exercício atual. Esta função é executada sempre que ele pressiona "terminei".
 */ 
function evaluateExercise (event) {

  // Avalia a nota
  var currentScore = getScore(screenExercise);

  // Mostra a mensagem de erro/acerto
  feedback(screenExercise, currentScore);

  // Atualiza a nota do LMS (apenas se a questão respondida é aquela esperada pelo LMS)
  if (!completed && screenExercise == scormExercise) {
    score = Math.max(0, Math.min(score + currentScore, 100));
    
    if (scormExercise < N_EXERCISES) {
      nextExercise();
    }
    else {
      completed = true;
      scormExercise = 1;
      save2LMS();
      scorm.quit();
    }
  }
}

/*
 * Prepara o próximo exercício.
 */ 
function nextExercise () {
  if (scormExercise < N_EXERCISES) ++scormExercise;
  
  $('#exercicios').tabs("enable", scormExercise);
}

/*
 * Avalia a nota do aluno num dado exercício.
 */ 
function getScore (exercise) {

  ans = 0;

  switch (exercise) {
  
    // Avalia a nota do exercício 1
    case 1:
    default:
      var resultant_x = document.ggbApplet.getXcoord('R2') - document.ggbApplet.getXcoord('R1');
      var resultant_y = document.ggbApplet.getYcoord('R2') - document.ggbApplet.getYcoord('R1');
      // Take e_rho coordinates
      var erho_x = document.ggbApplet.getXcoord('A2') - document.ggbApplet.getXcoord('A1');
      var erho_y = document.ggbApplet.getYcoord('A2') - document.ggbApplet.getYcoord('A1');
      // Take e_phi coordinates
      var ephi_x = document.ggbApplet.getXcoord('B2') - document.ggbApplet.getXcoord('B1');
      var ephi_y = document.ggbApplet.getYcoord('B2') - document.ggbApplet.getYcoord('B1');

      var mod_erho = Math.sqrt(erho_x*erho_x + erho_y*erho_y);
      var mod_ephi = Math.sqrt(ephi_x*ephi_x + ephi_y*ephi_y);
      var mod_resultant = Math.sqrt(resultant_x*resultant_x + resultant_y*resultant_y);


      var scalar_product_erho_ephi = (erho_x*ephi_x + erho_y*ephi_y)/(mod_erho*mod_ephi);
      
      var scalar_product_erho_r = (erho_x*resultant_x + erho_y*resultant_y)/(mod_erho*mod_resultant);

          if (1 - 0.01 <= scalar_product_erho_r &&
          scalar_product_erho_r <= 1 + 0.01 &&
          - 0.1 <= scalar_product_erho_ephi &&
          scalar_product_erho_ephi <= 0.1) {
          ans = 50;
      } else {
          ans = 0;
      }
      
      break;
      
    // Avalia a nota do exercício 2
    case 2:

      var e_rho = parseFloat($('#r_x').val().replace(',','.'));    
      var e_phi = parseFloat($('#r_y').val().replace(',','.'));
      var modulo_r = parseFloat($('#modulo_r').text().replace(',','.'));
 
      if (Math.abs(e_rho - modulo_r < 0.1) && Math.abs(e_phi) < 0.1) {
          ans = 50;
      } else {
          ans = 0;
      }    
    
      break;
  }
  
  return ans;
}

/*
 * Exibe a mensagem de erro/acerto (feedback) do aluno para um dado exercício e nota (naquele exercício).
 */ 
function feedback (exercise, score) {
                     
  switch (exercise) {
  
    // Feedback da resposta ao exercício 1
    case 1:
    default:
      if (score == 50) {
          $('#message1').html('<p/>Resposta correta!').removeClass().addClass("right-answer");
      } else {
          $('#message1').html('<p/>Resposta incorreta.').removeClass().addClass("wrong-answer");
      }
      
      break;
    
    // Feedback da resposta ao exercício 2
    case 2:
      if (score == 50) {
          $('#message2').html('<p/>Resposta correta!').removeClass().addClass("right-answer");
      } else {
          $('#message2').html('<p/>Resposta incorreta.').removeClass().addClass("wrong-answer");
      }
      
      break;
  }
}


var log = {};

log.trace = function (message) {
  if(window.console && window.console.firebug){
    console.log(message);
  }
  else {
    alert(message);
  }  
}

log.error = function (message) {
  if( (window.console && window.console.firebug) || console){
    console.error(message);
  }
  else {
    alert(message);
  }
}

// Mensagens de log
function message (m) {
	try {
		if (debug) console.log(m);
	}
	catch (error) {
		// Nada.
	}
}

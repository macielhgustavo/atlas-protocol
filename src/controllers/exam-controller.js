const examService = require('../services/exam-service');

async function createExam(request, response) {
  const exam = await examService.createExam(
    request.user,
    request.body,
    request.file,
  );
  return response.status(201).json({
    success: true,
    data: exam,
    message: 'Exame cadastrado com sucesso.',
  });
}

async function listExams(request, response) {
  const { exams, meta } = await examService.listExams(
    request.user,
    request.query,
  );
  return response.status(200).json({ success: true, data: exams, meta });
}

async function getExam(request, response) {
  const exam = await examService.getExam(request.user, request.params.id);
  return response.status(200).json({
    success: true,
    data: exam,
    message: 'Exame obtido com sucesso.',
  });
}

async function updateExam(request, response) {
  const exam = await examService.updateExam(
    request.user,
    request.params.id,
    request.body,
  );
  return response.status(200).json({
    success: true,
    data: exam,
    message: 'Exame atualizado com sucesso.',
  });
}

async function archiveExam(request, response) {
  const exam = await examService.archiveExam(request.user, request.params.id);
  return response.status(200).json({
    success: true,
    data: exam,
    message: 'Exame arquivado com sucesso.',
  });
}

module.exports = {
  archiveExam,
  createExam,
  getExam,
  listExams,
  updateExam,
};
